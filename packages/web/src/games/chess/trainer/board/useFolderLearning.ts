/**
 * How much of each folder you know: the colour's drill cards (`drill.ts`),
 * their schedule rows, and the folder owning each position (`folder-tree.ts`),
 * summed up the folders. Until the schedule loads every card counts as new.
 *
 * A folder can hold games of yours the tree hasn't grown into: on the way in,
 * a position of yours waits for the farm (or lies outside its folders), so
 * nothing past it is built. Such a folder is `blocked` at that position and
 * counts as `unreached` for itself and the folders above it, so none of them
 * reads as analysed on the strength of a few positions reached by
 * transposition.
 */
import {
  type DrillCard,
  drillCards,
  emptyLearning,
  type Learning,
  learningByFolder,
  pendingKeys,
} from "@boardgames/core/games/chess/trainer/drill";
import { FARM_FOCUS, TRAINER_FOLDERS } from "@boardgames/core/games/chess/trainer/folders";
import type { RepertoireTree } from "@boardgames/core/games/chess/trainer/tree";
import type { SrsState } from "@boardgames/core/trainers/srs";
import { useMemo } from "react";
import { dateKey } from "../../../../lib/offline-availability";
import { reachableFrom } from "../tree-nav";
import { flatten, type Placed, usePositionOwners } from "./folder-tree";
import { walkLine } from "./model";

export interface FolderLearning {
  readonly all: readonly Placed[];
  readonly owner: ReadonlyMap<string, string>;
  readonly cards: readonly DrillCard[];
  readonly byFolder: ReadonlyMap<string, Learning>;
  readonly total: Learning;
  /** A folder's cards, its subfolders' included. */
  readonly cardsIn: (folderId: string | null) => DrillCard[];
  /** Folders the tree hasn't grown into: where the way in waits, and whether the farm has it. */
  readonly blocked: ReadonlyMap<string, Blocked>;
  /**
   * The positions each folder waits on the farm for (yours and the
   * opponent's, its subfolders' included): what has to finish before the
   * folder is fully analysed.
   */
  readonly waitingIn: ReadonlyMap<string, readonly FarmPosition[]>;
}

export interface FarmPosition {
  readonly fen: string;
  readonly kind: "user" | "opp";
}

export interface Blocked {
  /** The move into the waiting position, as "1…d6". */
  readonly at: string;
  /** The farm is analysing it (inside its folders); else it was never queued. */
  readonly queued: boolean;
}

const NO_STATES: ReadonlyMap<string, SrsState> = new Map();

export function useFolderLearning(
  color: "w" | "b",
  tree: RepertoireTree | null,
  states: ReadonlyMap<string, SrsState> | null,
  today: string,
  /** Your games per folder (null while counting: every blocked folder counts then). */
  games: ReadonlyMap<string, number> | null,
): FolderLearning {
  const all = useMemo(() => flatten(TRAINER_FOLDERS[color]), [color]);
  const owner = usePositionOwners(all, tree);
  const cards = useMemo(() => (tree ? drillCards(tree) : []), [tree]);
  // Waiting positions inside the farm's folders are being analysed; the rest are never asked.
  const [pending, unasked] = useMemo(() => {
    if (!tree) return [[], []];
    const roots = FARM_FOCUS[color].map((moves) => walkLine(moves).at(-1)?.key ?? "");
    const focus = reachableFrom(tree, roots);
    const waiting = pendingKeys(tree);
    return [waiting.filter((k) => focus.has(k)), waiting.filter((k) => !focus.has(k))];
  }, [tree, color]);
  const waitingIn = useMemo(() => {
    const out = new Map<string, FarmPosition[]>();
    if (!tree) return out;
    const parent = new Map(all.map((p) => [p.folder.id, p.parents.at(-1)?.id]));
    for (const [key, n] of Object.entries(tree.nodes)) {
      if (n.status !== "awaiting-eval") continue;
      const item = { fen: n.fen, kind: n.side };
      for (let id = owner.get(key); id; id = parent.get(id)) {
        const list = out.get(id);
        if (list) list.push(item);
        else out.set(id, [item]);
      }
    }
    return out;
  }, [tree, all, owner]);
  const blocked = useMemo(() => {
    const out = new Map<string, Blocked>();
    if (!tree) return out;
    const roots = FARM_FOCUS[color].map((moves) => walkLine(moves).at(-1)?.key ?? "");
    const focus = reachableFrom(tree, roots);
    for (const p of all) {
      const steps = walkLine(p.folder.moves);
      // Walk the folder's own moves: stop where the tree leaves them (not your
      // repertoire) or where a position on the way hasn't been worked out.
      let key = tree.root;
      let reached = true;
      for (let i = 0; i < steps.length; i++) {
        const node = tree.nodes[key];
        const step = steps[i];
        if (!node || !step) break;
        if (node.status === "awaiting-eval" || node.status === "open") {
          const prev = steps[i - 1];
          const n = Math.floor((i - 1) / 2) + 1;
          out.set(p.folder.id, {
            at: prev ? `${n}${(i - 1) % 2 === 0 ? "." : "…"}${prev.san}` : "the start",
            queued: focus.has(key),
          });
          reached = false;
          break;
        }
        if (!node.moves.some((m) => m.uci === step.uci)) {
          reached = false;
          break;
        }
        key = step.key;
      }
      // Reached, but its own position waits: nothing inside is built either.
      const own = tree.nodes[key];
      const last = steps.at(-1);
      if (reached && last && own && (own.status === "awaiting-eval" || own.status === "open")) {
        const i = steps.length - 1;
        out.set(p.folder.id, {
          at: `${Math.floor(i / 2) + 1}${i % 2 === 0 ? "." : "…"}${last.san}`,
          queued: focus.has(key),
        });
      }
    }
    return out;
  }, [tree, color, all]);
  return useMemo(() => {
    const parent = new Map(all.map((p) => [p.folder.id, p.parents.at(-1)?.id]));
    const { byFolder, total } = learningByFolder({
      cards,
      pending,
      isExtension: (key) => tree?.nodes[key]?.extension !== undefined,
      unasked,
      unreached: [...blocked.keys()].filter((id) => (games?.get(id) ?? 1) > 0),
      states: states ?? NO_STATES,
      today,
      isToday: (iso) => dateKey(new Date(iso)) === today,
      ownerOf: (key) => owner.get(key),
      parentOf: (id) => parent.get(id),
    });
    const inside = (key: string, folderId: string) => {
      for (let id = owner.get(key); id; id = parent.get(id)) if (id === folderId) return true;
      return false;
    };
    return {
      all,
      owner,
      cards,
      byFolder,
      total: tree ? total : emptyLearning(),
      cardsIn: (folderId) => (folderId ? cards.filter((c) => inside(c.key, folderId)) : [...cards]),
      blocked,
      waitingIn,
    };
  }, [all, owner, cards, pending, unasked, blocked, waitingIn, games, states, today, tree]);
}
