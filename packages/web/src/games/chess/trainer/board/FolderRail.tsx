/**
 * The left rail: which colour you're playing, then that colour's folders
 * (`core/games/chess/trainer/folders.ts` — fixed in code, named by its
 * convention), and your lichess connection at the bottom.
 *
 * One folder level at a time, never indented: a breadcrumb of the way down
 * (♔ White › 1.e4 › 1…e5 › 2.Nf3, each a step back up), the open folder's own
 * header, and its subfolders as rows — icon, name, the move under it, and how
 * many of your games live there (distinct game lines through its position; two
 * identical games count once). Every name starts at the same x and every count
 * sits in a pill of the same width. Empty folders are hidden; the rest are
 * sorted largest first. The board decides where you are: open a folder and the
 * board goes there, play into one and the rail follows — by the position, not
 * the move order, so a line that transposes into another folder moves there.
 */
import {
  analysedUpToDate,
  type Learning,
  learnable,
} from "@boardgames/core/games/chess/trainer/drill";
import { TRAINER_FOLDERS, type TrainerFolder } from "@boardgames/core/games/chess/trainer/folders";
import type { RepertoireTree } from "@boardgames/core/games/chess/trainer/tree";
import { type ReactNode, useMemo } from "react";
import { ChevronRightIcon, FolderIcon, FolderOpenIcon } from "../../../../components/icons";
import { Button, SegmentedControl } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { isLeaf, nextKeys } from "../tree-nav";
import type { TreeBuild } from "../useTreeBuild";
import { BuildProgressRule, BuildStatusText } from "./BuildStatus";
import { currentFolder, flatten, type Placed, splitName, usePositionOwners } from "./folder-tree";
import { compact } from "./format";
import type { LineStep } from "./model";
import type { FolderGames } from "./useFolderGames";

type Color = "w" | "b";

interface FolderRailProps {
  readonly trees: Record<Color, RepertoireTree | null>;
  readonly color: Color;
  readonly onColor: (color: Color) => void;
  /** The moves on the board up to the shown position. */
  readonly moves: readonly LineStep[];
  readonly onOpen: (color: Color, moves: readonly string[]) => void;
  /** Your games per folder (`useFolderGames`, shared with the map). */
  readonly folderGames: FolderGames;
  /** How much of each folder you know (`useFolderLearning`). */
  readonly learning?: ReadonlyMap<string, Learning>;
  /** The open colour's build: its status takes the header's count while it runs. */
  readonly build?: TreeBuild | null;
  /** Errors to show above the folders (connection, loading). */
  readonly notice?: ReactNode;
  /** The lichess connection, at the bottom. */
  readonly footer?: ReactNode;
}

export function FolderRail({
  trees,
  color,
  onColor,
  moves,
  onOpen,
  folderGames,
  learning,
  build = null,
  notice,
  footer,
}: FolderRailProps) {
  const folders = TRAINER_FOLDERS[color];
  const all = useMemo(() => flatten(folders), [folders]);
  const { counts: games, transposed, total: totalGames } = folderGames;
  const owner = usePositionOwners(all, trees[color]);
  const { counts: lines, total: totalLines } = useLineCounts(
    all,
    trees[color],
    owner,
    games,
    totalGames,
  );

  // Folders with neither games nor lines go; the rest by lines, then games.
  const size = (f: TrainerFolder) => [lines?.get(f.id) ?? 0, games?.get(f.id) ?? 0] as const;
  const arrange = (list: readonly TrainerFolder[]): readonly TrainerFolder[] =>
    games
      ? list
          .filter((f) => size(f)[0] + size(f)[1] > 0)
          .sort((a, b) => size(b)[0] - size(a)[0] || size(b)[1] - size(a)[1])
      : list;

  // Where the board is (`folder-tree.ts:currentFolder`).
  const current = useMemo(() => currentFolder(all, moves, owner), [all, moves, owner]);
  // The open folder: the one you're in when it has subfolders, else its parent.
  const open =
    current && arrange(current.folder.children).length > 0
      ? current
      : current
        ? (all.find((p) => p.folder === current.parents.at(-1)) ?? null)
        : null;
  const listing = arrange(open ? open.folder.children : folders);
  const trail = open ? [...open.parents, open.folder] : [];
  const openLines = open ? (lines?.get(open.folder.id) ?? null) : totalLines;
  const openGames = open ? (games?.get(open.folder.id) ?? null) : totalGames;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <SegmentedControl
        aria-label="The colour you play"
        fullWidth
        options={[
          { value: "w", label: "♔ White" },
          { value: "b", label: "♚ Black" },
        ]}
        value={color}
        onChange={onColor}
      />
      {/* One tight block, the same at every level: the way down (each step goes
          back up to it) and the open folder's header, whose count gives way to
          the build's status while one runs and whose rule fills as progress. */}
      <div className="flex shrink-0 flex-col">
        {notice}
        <nav
          aria-label="Folder path"
          className="-ml-1.5 flex h-7 items-center gap-0.5 overflow-hidden text-2xs"
        >
          <Crumb onClick={() => onOpen(color, [])} active={trail.length === 0} label="All openings">
            <FolderIcon className="size-3.5" />
          </Crumb>
          {trail.map((f, i) => (
            <span key={f.id} className="flex shrink-0 items-center gap-0.5">
              <ChevronRightIcon className="size-3 text-fg-disabled" />
              <Crumb
                onClick={() => onOpen(color, f.moves)}
                active={i === trail.length - 1}
                label={f.name}
              >
                <span className="font-mono">{splitName(f.name).move}</span>
              </Crumb>
            </span>
          ))}
        </nav>
        <div className="flex h-9 items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate font-bold text-fg-strong"
            title={open?.folder.note}
          >
            {open ? splitName(open.folder.name).label : "All openings"}
          </span>
          <BuildStatusText
            build={build}
            fallback={
              openLines !== null && (
                <span
                  className="shrink-0 text-2xs text-fg-muted tabular-nums"
                  title={
                    openGames !== null ? `${openGames.toLocaleString()} of your games` : undefined
                  }
                >
                  {openLines.toLocaleString()} lines
                </span>
              )
            }
          />
        </div>
        <BuildProgressRule build={build} />
      </div>

      <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2">
        {listing.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-fg-muted">
            <FolderIcon className="size-8 opacity-50" />
            No folders here yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {listing.map((f) => (
              <li key={f.id}>
                <FolderRow
                  folder={f}
                  count={lines?.get(f.id) ?? null}
                  games={games?.get(f.id) ?? null}
                  transposed={transposed?.get(f.id) ?? 0}
                  parentCount={openLines}
                  learning={learning?.get(f.id) ?? null}
                  here={current?.folder.id === f.id}
                  hasChildren={arrange(f.children).length > 0}
                  onOpen={() => onOpen(color, f.moves)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      {footer}
    </div>
  );
}

function Crumb({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={active ? "location" : undefined}
      className={cn("px-1.5", active ? "text-fg-strong" : "text-fg-muted")}
    >
      {children}
    </Button>
  );
}

function FolderRow({
  folder,
  count,
  games,
  transposed,
  parentCount,
  here,
  hasChildren,
  learning,
  onOpen,
}: {
  folder: TrainerFolder;
  /** Your moves here: learnt, learning, new, still being analysed. */
  learning: Learning | null;
  /** Lines: where your games end up in this folder's tree (at least one per game; grows as the farm works). */
  count: number | null;
  games: number | null;
  /** Of `games`, games that reached this folder by another move order. */
  transposed: number;
  parentCount: number | null;
  here: boolean;
  hasChildren: boolean;
  onOpen: () => void;
}) {
  const { move, label } = splitName(folder.name);
  const share = count !== null && parentCount ? count / parentCount : null;
  const cards = learning ? learnable(learning) : 0;
  const learnSize = learning ? cards + learning.pending : 0;
  return (
    <Button
      variant="ghost"
      block
      align="start"
      onClick={onOpen}
      title={[
        folder.note ?? folder.name,
        count !== null
          ? `${count.toLocaleString()} lines (where your games end up in the tree; each game is at least one)`
          : "",
        games !== null ? `${games.toLocaleString()} of your games` : "",
        learning && cards > 0
          ? `${learning.learnt} of ${cards} of your moves learnt, ${learning.due} due`
          : "",
        transposed > 0
          ? `${transposed.toLocaleString()} of them by transposition (another move order)`
          : "",
      ]
        .filter(Boolean)
        .join("\n")}
      aria-current={here ? "location" : undefined}
      className={cn(
        "grid h-auto grid-cols-[1rem_1fr_2.75rem_0.5rem] items-center gap-2 px-2 py-2 text-left",
        here ? "bg-accent-500/15 ring-1 ring-accent-400/40 ring-inset" : "hover:bg-fill-soft",
      )}
    >
      <span className={cn("flex justify-center", here ? "text-accent-300" : "text-fg-muted")}>
        {here ? <FolderOpenIcon className="size-4" /> : <FolderIcon className="size-4" />}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn("truncate text-sm", here ? "text-fg-strong" : "text-fg-primary")}>
            {label}
          </span>
          {learning && analysedUpToDate(learning) && (
            <span
              className="shrink-0 font-bold text-3xs text-emerald-300"
              title="Every move of yours on your game lines is analysed"
            >
              ✓
            </span>
          )}
          {learning && learning.pendingLines > 0 && (
            <span
              className="shrink-0 text-3xs text-fg-muted"
              title={`${learning.pendingLines} of your moves here are still being analysed`}
            >
              ⟳
            </span>
          )}
          {learning && learning.due > 0 && (
            <span
              className="shrink-0 rounded-full bg-amber-300 px-1.5 font-bold text-3xs text-surface-950 leading-4"
              title={`${learning.due} reviews due today`}
            >
              {learning.due}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="w-11 shrink-0 font-mono text-3xs text-fg-muted">
            {move === label ? "" : move}
          </span>
          {learning && learnSize > 0 ? (
            // Your moves here: learnt, learning, new, then the part still being analysed.
            <span
              className="flex h-1 flex-1 overflow-hidden rounded-full bg-fill"
              title={`${learning.learnt} of ${cards} of your moves learnt`}
            >
              <span
                className="bg-accent-400"
                style={{ width: `${(learning.learnt / learnSize) * 100}%` }}
              />
              <span
                className="bg-accent-400/45"
                style={{ width: `${(learning.learning / learnSize) * 100}%` }}
              />
              <span
                className="bg-fill-strong"
                style={{ width: `${(learning.fresh / learnSize) * 100}%` }}
              />
            </span>
          ) : (
            share !== null && (
              <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-fill">
                <span
                  className="block h-full rounded-full bg-accent-400/60"
                  style={{ width: `${Math.max(3, share * 100)}%` }}
                />
              </span>
            )
          )}
        </span>
      </span>
      <span className="rounded-full bg-fill py-0.5 text-center font-mono text-2xs text-fg-secondary tabular-nums">
        {count === null ? "·" : compact(count)}
      </span>
      <span className="flex justify-center text-fg-disabled">
        {hasChildren && <ChevronRightIcon className="size-3" />}
      </span>
    </Button>
  );
}

/**
 * Lines per folder: the tree's line ends, counted so the number only grows as
 * the farm works.
 *
 *   a game the tree hasn't seen the end of (it still follows past the tree's
 *   last position, or waits there for the farm)             1 per game
 *   a line end of the tree's own (an extension, a padding
 *   answer, the tree's move where your games left it)       1
 *   a game that ended in the tree                           1
 *   a move into another folder's position (a transposition) 1, in the folder
 *                                                           the move is in
 *
 * A game that left the tree (you played another move than the tree's) is a
 * dead line: it counts for nothing. Each position counts for the deepest
 * folder that reaches it (the games' sole-owner rule) and subfolders add up;
 * a folder the tree hasn't reached yet shows its games, one line each.
 */
function useLineCounts(
  all: readonly Placed[],
  tree: RepertoireTree | null,
  owner: ReadonlyMap<string, string>,
  games: ReadonlyMap<string, number> | null,
  totalGames: number | null,
): { counts: Map<string, number> | null; total: number | null } {
  return useMemo(() => {
    if (!tree) return { counts: null, total: null };
    const linesAt = (key: string): number => {
      const node = tree.nodes[key];
      if (!node) return 0;
      const ended = node.ended ?? 0;
      if (!isLeaf(tree, key)) return ended;
      const left = (node.deviations ?? []).reduce((t, d) => t + d.games, 0);
      const onward = Math.max(0, node.following - left - ended);
      return ended + onward > 0 ? ended + onward : 1;
    };
    const direct = new Map<string, number>();
    const add = (id: string, n: number) => direct.set(id, (direct.get(id) ?? 0) + n);
    const inTree = new Set<string>();
    for (const [key, id] of owner) {
      add(id, linesAt(key));
      inTree.add(id);
    }
    // A move into another folder's position (a transposition): a line of its
    // own folder, ending there. The folder both sit in counts it once, through
    // the other folder's lines.
    const parentOf = new Map(all.map((p) => [p.folder.id, p.parents.at(-1)?.id]));
    const chain = (id: string | undefined): string[] =>
      id ? [id, ...chain(parentOf.get(id))] : [];
    for (const [key, id] of owner) {
      for (const next of nextKeys(tree, key)) {
        const to = next ? owner.get(next) : undefined;
        if (!to || to === id) continue;
        const toChain = chain(to);
        if (toChain.includes(id)) continue; // into one of its own subfolders
        add(id, 1);
        const common = chain(id).find((a) => toChain.includes(a));
        if (common) add(common, -1);
      }
    }
    const counts = new Map<string, number>();
    const sum = (f: TrainerFolder): [lines: number, reached: boolean] => {
      let n = direct.get(f.id) ?? 0;
      let reached = inTree.has(f.id);
      for (const c of f.children) {
        const [cn, cr] = sum(c);
        n += cn;
        reached ||= cr;
      }
      if (!reached) n = games?.get(f.id) ?? 0;
      counts.set(f.id, n);
      return [n, reached];
    };
    let total = 0;
    let reached = false;
    for (const top of all.filter((p) => p.parents.length === 0)) {
      const [n, r] = sum(top.folder);
      total += n;
      reached ||= r;
    }
    return { counts, total: reached ? total : (totalGames ?? total) };
  }, [all, tree, owner, games, totalGames]);
}
