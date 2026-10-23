/**
 * The map of what you know: the open folder's subfolders as a treemap
 * (`treemap.ts`), each block sized by how often lichess players enter the
 * folder (`useFolderPopularity`: the games playing its entering move; your
 * moves in it until those counts arrive) and shaded by how many of your moves
 * there you've learnt (moves still being learnt count for a little). The
 * corner chip is the farm's part (`farmChip`): "✓ complete" (every position,
 * extensions past your games too), "✓ analysed" (your game lines; extensions
 * still running), "⟳ N analysing" (N of your line moves at the farm now) or
 * "N not queued" (outside the farm's folders, never sent), or "waits for
 * 1…d6" when the tree hasn't grown into the folder at all (`Blocked`: the way
 * in stops at a position of yours the farm hasn't settled). A slim bar shows
 * learnt / learning / new / still analysing (hatched); a dashed block has
 * nothing analysed yet. A bright
 * top edge and "today" mark a folder whose every move you answered today
 * (never a parent for one subfolder's practice); the orange badge
 * counts the moves due (a due folder is reviewed whole). The same folders as
 * the rail: any with moves or games of yours. The two smallest blocks lie on
 * their side so their names fit; folders too small to read are gathered into
 * one block that opens them. Click a block to select it; click it again (or
 * double-click) to go inside.
 */
import {
  analysedComplete,
  analysedUpToDate,
  emptyLearning,
  type Learning,
  learnable,
} from "@boardgames/core/games/chess/trainer/drill";
import type { TrainerFolder } from "@boardgames/core/games/chess/trainer/folders";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRightIcon } from "../../../../components/icons";
import { cn } from "../../../../lib/cn";
import { type Placed, splitName } from "./folder-tree";
import { KnowledgeBar } from "./KnowledgeBar";
import { squarify } from "./treemap";
import type { Blocked } from "./useFolderLearning";
import type { Popularity } from "./useFolderPopularity";

interface Props {
  /** The folders at this level of the map. */
  readonly folders: readonly Placed[];
  readonly learning: ReadonlyMap<string, Learning>;
  /** Your games per folder: a folder with games but no moves yet still gets a block. */
  readonly games: ReadonlyMap<string, number> | null;
  /** Folders the tree hasn't grown into, and where it waits. */
  readonly blocked: ReadonlyMap<string, Blocked>;
  /** Lichess games entering each folder: the blocks' sizes once every folder here has one. */
  readonly popularity: ReadonlyMap<string, Popularity>;
  readonly selected: string | null;
  readonly onSelect: (folderId: string) => void;
  /** Double-click: show that folder's own subfolders. */
  readonly onOpen: (folder: Placed) => void;
  /** Showing the small folders' block opened up (the screen's header leads back). */
  readonly showSmall: boolean;
  readonly onShowSmall: () => void;
}

/** Below this share of the map, a folder joins the "small folders" block. */
const SMALL_SHARE = 0.025;
/** Blocks smaller than this (px²) lie on their side: a narrow column can't fit a name. */
const WIDE_BELOW = 210 * 210;
/** How much a move still being learnt shades its block, against a learnt one. */
const LEARNING_SHADE = 0.35;

type Tile =
  | {
      readonly kind: "folder";
      readonly placed: Placed;
      readonly l: Learning;
      readonly size: number;
      readonly blocked?: Blocked;
      /** Its subfolders with something in them, biggest first: a roomy block lists them. */
      readonly inside: readonly Row[];
    }
  | {
      readonly kind: "small";
      readonly members: readonly Placed[];
      readonly l: Learning;
      readonly size: number;
      readonly inside: readonly Row[];
    };

interface Row {
  readonly name: string;
  readonly l: Learning;
  /** Your games there (what a folder without moves yet shows). */
  readonly games: number;
}

/** The block gathering the folders too small to draw: named like the openings around it. */
const SMALL_NAME = "Rare Replies";

const sizeOf = (l: Learning) => learnable(l) + l.pending + l.unasked;

function sum(ls: readonly Learning[]): Learning {
  const out = emptyLearning();
  for (const l of ls) {
    out.learnt += l.learnt;
    out.learning += l.learning;
    out.fresh += l.fresh;
    out.due += l.due;
    out.practisedToday += l.practisedToday;
    out.pending += l.pending;
    out.pendingLines += l.pendingLines;
    out.unasked += l.unasked;
    out.unreached += l.unreached;
  }
  return out;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, size] as const;
}

export function AtlasMap({
  folders,
  learning,
  games,
  blocked,
  popularity,
  selected,
  onSelect,
  onOpen,
  showSmall,
  onShowSmall,
}: Props) {
  const [ref, box] = useElementSize<HTMLDivElement>();

  const tiles = useMemo((): Tile[] => {
    const shown = folders.flatMap((placed) => {
      const l = learning.get(placed.folder.id) ?? emptyLearning();
      const mine = games?.get(placed.folder.id) ?? 0;
      return sizeOf(l) > 0 || mine > 0 ? [{ placed, l, mine }] : [];
    });
    const byGames = shown.every((t) => popularity.has(t.placed.folder.id));
    // A folder lichess never plays still gets a sliver, so it stays on the map.
    const maxGames = Math.max(
      1,
      ...shown.map((t) => popularity.get(t.placed.folder.id)?.games ?? 0),
    );
    const withSize = shown.map(({ placed, l, mine }) => ({
      kind: "folder" as const,
      placed,
      l,
      blocked: blocked.get(placed.folder.id),
      inside: insideOf(placed.folder, learning, games),
      size: byGames
        ? Math.max(maxGames * 0.002, popularity.get(placed.folder.id)?.games ?? 0)
        : Math.max(sizeOf(l), mine),
    }));
    const total = withSize.reduce((t, x) => t + x.size, 0);
    const small = withSize.filter((t) => t.size < total * SMALL_SHARE);
    if (showSmall && small.length >= 2) return small;
    if (small.length < 2) return withSize;
    const big = withSize.filter((t) => t.size >= total * SMALL_SHARE);
    const l = sum(small.map((x) => x.l));
    const size = small.reduce((t, x) => t + x.size, 0);
    const inside = small.map((x) => ({
      name: splitName(x.placed.folder.name).label,
      l: x.l,
      games: games?.get(x.placed.folder.id) ?? 0,
    }));
    return [...big, { kind: "small", members: small.map((x) => x.placed), l, size, inside }];
  }, [folders, learning, games, blocked, popularity, showSmall]);

  const rects = useMemo(
    () => squarify(tiles, (t) => t.size, box.w, box.h, WIDE_BELOW),
    [tiles, box.w, box.h],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={ref} className="relative min-h-0 flex-1">
        {rects.length === 0 && box.w > 0 && (
          <div className="flex h-full items-center justify-center text-sm text-fg-muted">
            Nothing here to learn yet. Your moves appear once the tree is built and analysed.
          </div>
        )}
        {rects.map(({ item, x, y, w, h }) => (
          <TileView
            key={item.kind === "folder" ? item.placed.folder.id : "small"}
            tile={item}
            box={{ x, y, w, h }}
            selected={item.kind === "folder" && item.placed.folder.id === selected}
            onClick={() => {
              if (item.kind === "small") onShowSmall();
              // A second click on the selected folder goes inside it.
              else if (item.placed.folder.id === selected && item.placed.folder.children.length > 0)
                onOpen(item.placed);
              else onSelect(item.placed.folder.id);
            }}
            onOpen={item.kind === "folder" ? () => onOpen(item.placed) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function TileView({
  tile,
  box,
  selected,
  onClick,
  onOpen,
}: {
  tile: Tile;
  box: { x: number; y: number; w: number; h: number };
  selected: boolean;
  onClick: () => void;
  onOpen?: () => void;
}) {
  const l = tile.l;
  const cards = learnable(l);
  const share = cards > 0 ? (l.learnt + LEARNING_SHADE * l.learning) / cards : 0;
  const own = tile.kind === "folder" ? tile.blocked : undefined;
  const chip = farmChip(l, own);
  const neverAsked = cards === 0 && l.pending === 0;
  const big = box.w > 260 && box.h > 170;
  const narrow = box.w < 150;
  // "Today" only when every move here was answered today: a few lines in one
  // subfolder never mark the whole folder.
  const allToday = cards > 0 && l.practisedToday >= cards;
  const tiny = box.w < 84 || box.h < 52;
  // A short block: the name on one line, no entering move, no bar.
  const short = !tiny && box.h < 92;
  // Room to list what's inside.
  const roomy = box.w >= 180 && box.h >= 150;
  const { move, label } =
    tile.kind === "folder"
      ? splitName(tile.placed.folder.name)
      : { move: `${tile.members.length} folders`, label: SMALL_NAME };
  const hasChildren = tile.kind === "folder" && tile.placed.folder.children.length > 0;
  // Light ink once the shade is bright enough to need it dark.
  const darkInk = share > 0.55;
  return (
    // biome-ignore lint/correctness/noRestrictedElements: a treemap tile is a positioned, shaded surface, not a control shape the UI kit has.
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onOpen}
      aria-pressed={tile.kind === "folder" ? selected : undefined}
      aria-label={
        tile.kind === "small"
          ? `${label}: ${l.learnt} of ${cards} moves learnt. Show them.`
          : neverAsked
            ? `${label}: nothing to learn yet. ${chip.title}`
            : `${label}: ${l.learnt} of ${cards} moves learnt, ${l.learning} learning, ${l.due} due today${allToday ? ", all practised today" : ""}. ${chip.title}`
      }
      className={cn(
        "absolute overflow-hidden rounded-card-md text-left focus-visible:outline-2 focus-visible:outline-accent-400 focus-visible:-outline-offset-2",
        neverAsked ? "border-2 border-dashed border-line-strong" : "border-2 border-surface-900",
        selected && "border-fg-strong",
      )}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        background: neverAsked
          ? undefined
          : `color-mix(in srgb, var(--color-accent-400) ${Math.round(share * 100)}%, var(--color-surface-700))`,
      }}
    >
      {allToday && (
        <span aria-hidden="true" className="absolute inset-x-0 top-0 z-lift h-1 bg-accent-300" />
      )}
      <span
        className={cn(
          "relative flex h-full flex-col justify-between",
          tiny ? "p-1.5" : "p-2.5",
          darkInk ? "text-surface-950" : "text-fg-strong",
        )}
      >
        {/* Top: the name on its own line (wrapping, never cut short while there's room), then
            the entering move; the due count and "go inside" mark sit beside it. */}
        <span className="flex items-start gap-1">
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={cn(
                "font-bold leading-tight",
                tiny || short ? "truncate" : "line-clamp-2 break-words",
                tiny && "text-3xs",
                big ? "text-xl" : !tiny && "text-sm",
                neverAsked && "text-fg-muted",
              )}
            >
              {label}
            </span>
            {!tiny && !short && move !== label && move && (
              <span className="font-mono text-3xs opacity-80">{move}</span>
            )}
          </span>
          {allToday && !tiny && (
            <span
              className="shrink-0 whitespace-nowrap rounded-full bg-accent-300 px-1.5 font-semibold text-3xs text-surface-950 leading-4"
              title="Every move of yours here practised today"
            >
              today
            </span>
          )}
          {l.due > 0 && (
            <span className="shrink-0 rounded-full bg-amber-300 px-1.5 font-bold text-3xs text-surface-950 leading-4">
              {l.due}
            </span>
          )}
          {hasChildren && !tiny && <ChevronRightIcon className="size-3 shrink-0 opacity-70" />}
        </span>
        {roomy && tile.inside.length > 0 && <Inside rows={tile.inside} room={box.h - 100} />}
        {big && neverAsked && own && tile.inside.length === 0 && (
          <span className="max-w-sm flex-1 pt-4 text-fg-muted text-xs leading-relaxed">
            Your move after {own.at}{" "}
            {own.queued ? "is still being analysed" : "isn't queued for the farm"}, so the tree
            stops there and nothing inside is built yet.
          </span>
        )}
        {/* Bottom: what you know (a bar of learnt / learning / new / still analysing on
            blocks tall enough), and whether the farm is done here. */}
        {!tiny && (
          <span className="flex flex-col gap-1.5">
            {!short && cards + l.pending > 0 && <KnowledgeBar l={l} />}
            <span className="flex items-end justify-between gap-x-2">
              <span
                className={cn(
                  "min-w-0 truncate whitespace-nowrap font-mono tabular-nums",
                  big ? "text-base" : "text-2xs",
                  neverAsked && "text-fg-muted",
                )}
              >
                {neverAsked
                  ? own
                    ? `waits for ${own.at}`
                    : "not analysed"
                  : `${l.learnt}/${cards.toLocaleString()}${narrow ? "" : " learnt"}${l.learning > 0 && big ? ` · ${l.learning} learning` : ""}`}
              </span>
              <span className="flex items-center gap-1">
                {tile.kind === "folder" && !neverAsked && (
                  <span
                    className={cn(
                      "whitespace-nowrap rounded-full px-1.5 font-semibold text-3xs leading-4",
                      CHIP_TONE[chip.tone],
                    )}
                    title={chip.title}
                  >
                    {narrow ? chip.short : chip.text}
                  </span>
                )}
              </span>
            </span>
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * A folder's subfolders with moves or games of yours in them, biggest first. Through a chain of
 * single subfolders (Open Game › King's Knight) to the first real choice.
 */
function insideOf(
  folder: TrainerFolder,
  learning: ReadonlyMap<string, Learning>,
  games: ReadonlyMap<string, number> | null,
): Row[] {
  let at = folder;
  for (;;) {
    // Moves of yours first, then games of yours (a folder the tree hasn't reached yet).
    const rows = at.children
      .map((c) => ({
        folder: c,
        l: learning.get(c.id) ?? emptyLearning(),
        g: games?.get(c.id) ?? 0,
      }))
      .filter((c) => sizeOf(c.l) > 0 || c.g > 0)
      .sort((a, b) => sizeOf(b.l) - sizeOf(a.l) || b.g - a.g);
    const only = rows.length === 1 ? rows[0] : undefined;
    if (!only)
      return rows.map((r) => ({ name: splitName(r.folder.name).label, l: r.l, games: r.g }));
    at = only.folder;
  }
}

/** A roomy block's subfolders, as many as fit in `room` px: where you'd go next. */
function Inside({ rows, room }: { rows: readonly Row[]; room: number }) {
  const fit = Math.max(0, Math.min(10, Math.floor(room / 22)));
  if (fit === 0) return null;
  // Too many to fit: the last line says how many more (unless it's the only line).
  const shown = rows.length <= fit ? rows : rows.slice(0, fit > 1 ? fit - 1 : 1);
  const more = rows.length - shown.length;
  return (
    <span className="flex min-h-0 flex-1 flex-col gap-1 pt-4 text-xs">
      {shown.map((r) => (
        <span key={r.name} className="flex items-baseline gap-2 opacity-75">
          <span className="min-w-0 truncate">{r.name}</span>
          <span className="flex-1 border-current border-b border-dotted opacity-25" />
          <span className="shrink-0 font-mono tabular-nums">
            {learnable(r.l) > 0
              ? `${r.l.learnt}/${learnable(r.l)}`
              : r.games > 0
                ? `${r.games.toLocaleString()} games`
                : "—"}
          </span>
        </span>
      ))}
      {more > 0 && <span className="opacity-50">+{more} more</span>}
    </span>
  );
}

const CHIP_TONE = {
  complete: "bg-emerald-300 text-surface-950",
  lines: "border border-emerald-300/70 text-emerald-200",
  running: "bg-surface-950/55 text-fg-secondary",
  unqueued: "border border-dashed border-fg-muted/60 text-fg-muted",
} as const;

/** What the farm has done in a folder, as one chip. */
function farmChip(
  l: Learning,
  blocked: Blocked | undefined,
): {
  text: string;
  /** For a narrow block. */
  short: string;
  title: string;
  tone: keyof typeof CHIP_TONE;
} {
  if (blocked) {
    return {
      text: `waits for ${blocked.at}`,
      short: "waits",
      tone: blocked.queued ? "running" : "unqueued",
      title: `The tree hasn't grown into this folder: your move after ${blocked.at} ${blocked.queued ? "is still being analysed" : "is outside the farm's folders and not queued"}. What's here came by transposition.`,
    };
  }
  if (analysedComplete(l)) {
    return {
      text: "✓ complete",
      short: "✓",
      tone: "complete",
      title: "Everything here is analysed, the extensions past your games included",
    };
  }
  if (analysedUpToDate(l)) {
    return {
      text: "✓ analysed",
      short: "✓ lines",
      tone: "lines",
      title: `Your game lines are analysed; ${l.pending} extension positions past them are still running`,
    };
  }
  if (l.pendingLines > 0) {
    return {
      text: `⟳ ${l.pendingLines} analysing`,
      short: `⟳ ${l.pendingLines}`,
      tone: "running",
      title: `${l.pendingLines} of your moves here are at the farm now${l.unasked > 0 ? `; ${l.unasked} more are outside its folders and not queued` : ""}`,
    };
  }
  return {
    text: `${l.unasked} not queued`,
    short: `${l.unasked} unqueued`,
    tone: "unqueued",
    title: `${l.unasked} of your moves here are outside the farm's folders: never sent for analysis`,
  };
}
