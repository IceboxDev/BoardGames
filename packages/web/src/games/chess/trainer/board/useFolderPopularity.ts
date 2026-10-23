/**
 * How often each folder happens on lichess: the explorer's game count for the
 * folder's last move, from the position before it (every rating and speed).
 * That is how many lichess games enter the folder that way, and it sizes the
 * map's blocks and ranks the suggestions. The counts come through the shared
 * explorer cache (`lichess/explorer-store.ts`) and are kept in this browser
 * for a month too (they barely move).
 */
import type { RepertoireTree } from "@boardgames/core/games/chess/trainer/tree";
import { useEffect, useState } from "react";
import { z } from "zod";
import type { TrainerProviders } from "../engine-provider";
import type { Placed } from "./folder-tree";
import { START, walkLine } from "./model";

export interface Popularity {
  /** Lichess games that play the folder's entering move. */
  readonly games: number;
  /** Of the games at the position before it, the share that play this move. */
  readonly share: number;
}

const STORE_KEY = "chess-trainer.folderPopularity.v1";
const KEEP_MS = 30 * 24 * 3600_000;

const StoredSchema = z.record(
  z.string(),
  z.object({ games: z.number().nonnegative(), share: z.number().min(0).max(1), at: z.number() }),
);
type Stored = z.infer<typeof StoredSchema>;

function readStore(): Stored {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = StoredSchema.safeParse(raw ? JSON.parse(raw) : {});
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function writeStore(store: Stored) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Not kept (private window, quota): asked again next visit.
  }
}

/** The position before a folder's last move (its FEN and key), and that move. */
function entry(p: Placed): { fen: string; key: string; uci: string } | null {
  const uci = p.folder.moves.at(-1);
  if (!uci) return null;
  const before = walkLine(p.folder.moves.slice(0, -1)).at(-1) ?? START;
  return { fen: before.fen, key: before.key, uci };
}

/**
 * The count the tree already holds: an opponent position keeps lichess's most
 * played moves (`node.popular`, top 12), which covers the common entries.
 */
function fromTree(tree: RepertoireTree | null, e: { key: string; uci: string }): Popularity | null {
  const popular = tree?.nodes[e.key]?.popular;
  const hit = popular?.find((m) => m.uci === e.uci);
  if (!popular || !hit) return null;
  const total = popular.reduce((t, m) => t + m.games, 0);
  return { games: hit.games, share: total > 0 ? hit.games / total : 0 };
}

const keyOf = (e: { fen: string; uci: string }) => `${e.fen}|${e.uci}`;

export function useFolderPopularity(
  folders: readonly Placed[],
  providers: TrainerProviders | null,
  tree: RepertoireTree | null,
): ReadonlyMap<string, Popularity> {
  const [known, setKnown] = useState<Stored>(() => {
    const now = Date.now();
    return Object.fromEntries(Object.entries(readStore()).filter(([, v]) => now - v.at < KEEP_MS));
  });

  const wanted = folders.flatMap((p) => {
    const e = entry(p);
    return e && !known[keyOf(e)] && !fromTree(tree, e) ? [e] : [];
  });
  const wantedKey = wanted.map(keyOf).join(";");

  useEffect(() => {
    if (!providers || !wantedKey) return;
    let live = true;
    // One explorer request per position; folders entering from the same position share it.
    const byFen = new Map<string, string[]>();
    for (const k of wantedKey.split(";")) {
      const [fen, uci] = k.split("|") as [string, string];
      byFen.set(fen, [...(byFen.get(fen) ?? []), uci]);
    }
    void (async () => {
      for (const [fen, ucis] of byFen) {
        try {
          // Behind the build and anything on screen: sizes can wait.
          const moves = await providers.explorer(fen, "background");
          if (!live) return;
          const total = moves.reduce((t, m) => t + m.games, 0);
          const at = Date.now();
          setKnown((prev) => {
            const next = { ...prev };
            for (const uci of ucis) {
              const games = moves.find((m) => m.uci === uci)?.games ?? 0;
              next[`${fen}|${uci}`] = { games, share: total > 0 ? games / total : 0, at };
            }
            writeStore(next);
            return next;
          });
        } catch {
          // lichess unreachable: the map keeps its fallback sizes for now.
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [providers, wantedKey]);

  const out = new Map<string, Popularity>();
  for (const p of folders) {
    const e = entry(p);
    if (!e) continue;
    const hit = known[keyOf(e)] ?? fromTree(tree, e);
    if (hit) out.set(p.folder.id, { games: hit.games, share: hit.share });
  }
  return out;
}
