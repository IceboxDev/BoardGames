/**
 * The right rail, laid out like lichess's analysis board:
 *
 *   1. the engine strip — the shown position's evaluation, where it comes from
 *      and how deep, and the engine's line (click a move to play up to it);
 *   2. the moves — the line on the board as a numbered two-column list;
 *   3. the explorer — every candidate move from here: your games, the lichess
 *      database (share and White / draw / Black), the engine's score.
 *
 * Every part has a fixed size — the engine strip and the moves a set height,
 * the explorer the rest down to the bottom — and scrolls inside itself, so
 * nothing moves when the position changes.
 */
import type { MoveStat } from "@boardgames/core/games/chess/trainer/position-index";
import type { RepertoireTree, TreeNode } from "@boardgames/core/games/chess/trainer/tree";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button, MicroLabel, Spinner } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import type { TrainerProviders } from "../engine-provider";
import type { ExplorerMove } from "../lichess/client";
import { scoreText } from "../tree-nav";
import { compact, percent } from "./format";
import { KIND, KIND_COLOR, KIND_OF, kindsOf, type MoveKind, SOURCE_TITLE } from "./markers";
import { type ExplorerRow, explorerRows, type LineStep, pvSans } from "./model";
import type { PositionEval } from "./usePositionEval";

interface Props {
  readonly fen: string;
  readonly node: TreeNode | null;
  readonly tree: RepertoireTree | null;
  readonly line: readonly LineStep[];
  readonly ply: number;
  readonly onPlay: (uci: string) => void;
  readonly onGoTo: (ply: number) => void;
  /** Play several moves from the shown position (an engine line up to a move). */
  readonly onPlayLine: (ucis: readonly string[]) => void;
  /** The colour you play here: the "You" column counts only your games as it. */
  readonly color: "w" | "b";
  /** Your games as the open colour, from the build worker. */
  readonly positionStats: ((fen: string) => Promise<MoveStat[]>) | null;
  /** The lichess database; null without a lichess connection. */
  readonly providers: TrainerProviders | null;
  readonly evaluation: PositionEval | null;
  readonly evalLoading: boolean;
  /** Pinned to the rail's foot (the board's one decision, `ChoiceCard`). */
  readonly footer?: ReactNode;
  /** Your games here and how many came by another move order (the explorer's header). */
  readonly transposition:
    | ((fen: string, moves: readonly string[]) => Promise<{ games: number; transposed: number }>)
    | null;
}

/** `load(fen)`'s answer for the current fen, `null` while it's on its way. */
function useLookup<T>(fen: string, load: ((fen: string) => Promise<T>) | null) {
  const [state, setState] = useState<{ fen: string; value: T } | null>(null);
  useEffect(() => {
    if (!load) return;
    let live = true;
    load(fen)
      .then((value) => live && setState({ fen, value }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [fen, load]);
  return state?.fen === fen ? state.value : null;
}

export function ExplorerRail({
  fen,
  node,
  tree,
  line,
  ply,
  onPlay,
  onGoTo,
  onPlayLine,
  color,
  positionStats,
  providers,
  evaluation,
  evalLoading,
  transposition,
  footer,
}: Props) {
  const yours = useLookup<MoveStat[]>(fen, positionStats);
  const db = useLookup<ExplorerMove[]>(
    fen,
    useMemo(() => (providers ? (f: string) => providers.explorer(f) : null), [providers]),
  );
  const here = useMemo(() => line.slice(0, ply).map((m) => m.uci), [line, ply]);
  const reach = useLookup<{ games: number; transposed: number }>(
    fen,
    useMemo(
      () => (transposition ? (f: string) => transposition(f, here) : null),
      [transposition, here],
    ),
  );
  const rows = useMemo(
    () =>
      explorerRows({
        fen,
        node,
        tree,
        yours: yours ?? [],
        db: db ?? [],
        engine: evaluation?.lines ?? [],
      }),
    [fen, node, tree, yours, db, evaluation],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <EngineStrip
        fen={fen}
        evaluation={evaluation}
        loading={evalLoading}
        onPlayLine={onPlayLine}
      />
      <MoveList line={line} ply={ply} onGoTo={onGoTo} />
      <MoveTable
        key={fen}
        fen={fen}
        color={color}
        rows={rows}
        reach={reach}
        bestUci={evaluation?.lines[0]?.uci ?? null}
        yourMove={node?.side === "user" ? (node.moves[0]?.uci ?? null) : null}
        onPlay={onPlay}
        loading={{
          yours: positionStats !== null && yours === null,
          db: providers !== null && db === null,
        }}
      />
      {footer && <div className="mt-auto flex flex-col">{footer}</div>}
    </div>
  );
}

// ── 1. Engine ──────────────────────────────────────────────────────────

function EngineStrip({
  fen,
  evaluation,
  loading,
  onPlayLine,
}: {
  fen: string;
  evaluation: PositionEval | null;
  loading: boolean;
  onPlayLine: (ucis: readonly string[]) => void;
}) {
  const best = evaluation?.lines[0];
  const pv = best ? pvSans(fen, best.pv ?? [best.uci], 10) : [];
  return (
    <div className="flex h-24 shrink-0 flex-col justify-center gap-2 overflow-hidden rounded-card-md bg-fill-soft px-3 ring-1 ring-line-soft">
      <div className="flex h-8 items-baseline gap-3">
        <span className="font-mono text-2xl font-bold tabular-nums text-fg-strong">
          {best ? scoreText(fen, best) : loading ? <Spinner /> : "—"}
        </span>
        <span className="min-w-0 flex-1 truncate text-2xs text-fg-muted">
          {evaluation
            ? `Stockfish · depth ${evaluation.depth} · ${evaluation.source}`
            : loading
              ? "Evaluating…"
              : "Connect lichess for an evaluation"}
        </span>
      </div>
      {pv.length > 0 ? (
        <div className="flex h-6 items-center gap-x-1 overflow-hidden font-mono text-xs whitespace-nowrap [mask-image:linear-gradient(to_right,black_85%,transparent)]">
          {pv.map((m, i) => (
            // biome-ignore lint/correctness/noRestrictedElements: a notation chip in a run of moves — a Button's padding and chrome would break the line's flow
            <button
              type="button"
              key={pv
                .slice(0, i + 1)
                .map((x) => x.uci)
                .join(" ")}
              onClick={() => onPlayLine(pv.slice(0, i + 1).map((x) => x.uci))}
              className={cn(
                "rounded-ui-md px-1 py-0.5 transition hover:bg-fill hover:text-fg-strong",
                i === 0 ? "font-bold text-fg-strong" : "text-fg-secondary",
              )}
              title="Play the line up to this move"
            >
              {m.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="h-6" />
      )}
    </div>
  );
}

// ── 2. Moves ───────────────────────────────────────────────────────────

function MoveList({
  line,
  ply,
  onGoTo,
}: {
  line: readonly LineStep[];
  ply: number;
  onGoTo: (ply: number) => void;
}) {
  const current = useRef<HTMLButtonElement | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll the shown move into view whenever it changes
  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest" });
  }, [ply]);
  const rows: { n: number; w?: { s: LineStep; i: number }; b?: { s: LineStep; i: number } }[] = [];
  line.forEach((s, i) => {
    const n = Math.floor(i / 2) + 1;
    if (i % 2 === 0) rows.push({ n, w: { s, i } });
    else {
      const row = rows.at(-1);
      if (row) row.b = { s, i };
    }
  });
  const cell = (c: { s: LineStep; i: number } | undefined) =>
    c ? (
      // biome-ignore lint/correctness/noRestrictedElements: a move-list cell (like lichess's), text only
      <button
        type="button"
        ref={ply === c.i + 1 ? current : undefined}
        onClick={() => onGoTo(c.i + 1)}
        className={cn(
          "rounded-ui-md px-2 py-1 text-left font-mono text-sm transition",
          ply === c.i + 1
            ? "bg-accent-500/20 font-semibold text-fg-strong"
            : c.i >= ply
              ? "text-fg-disabled hover:bg-fill-soft hover:text-fg-secondary"
              : "text-fg-primary hover:bg-fill-soft",
        )}
      >
        {c.s.san}
      </button>
    ) : (
      <span />
    );
  return (
    <div className="flex min-h-24 flex-1 flex-col overflow-y-auto rounded-card-md ring-1 ring-line-soft">
      {rows.length === 0 ? (
        <p className="p-3 text-sm text-fg-muted">Play a move on the board, or open a folder.</p>
      ) : (
        rows.map((r) => (
          <div
            key={r.n}
            className="grid grid-cols-[2.25rem_1fr_1fr] items-center odd:bg-fill-soft/60"
          >
            <span className="pr-2 text-right font-mono text-2xs text-fg-muted">{r.n}</span>
            {cell(r.w)}
            {cell(r.b)}
          </div>
        ))
      )}
    </div>
  );
}

// ── 3. Explorer ────────────────────────────────────────────────────────

const GRID = "grid grid-cols-[4rem_4.5rem_1fr_2.75rem] items-center gap-2";

/**
 * The explorer: a fixed-height panel pinned to the bottom of the rail.
 *
 *   - your position with a move set: that move, then the other moves YOU have
 *     played here (where your games left the tree), and — on request — the
 *     rest of lichess's and the engine's candidates;
 *   - any other position: the tree's moves (engine order), then everything else.
 *
 * A legend at the foot names the three kinds of move.
 */
function MoveTable({
  fen,
  color,
  rows,
  reach,
  bestUci,
  yourMove,
  onPlay,
  loading,
}: {
  fen: string;
  color: "w" | "b";
  rows: readonly ExplorerRow[];
  /** Your games here, and how many transposed in. */
  reach: { games: number; transposed: number } | null;
  /** The engine's best move here (marks its row). */
  bestUci: string | null;
  /** Your position with a move set in the tree. */
  yourMove: string | null;
  onPlay: (uci: string) => void;
  loading: { yours: boolean; db: boolean };
}) {
  const [showRest, setShowRest] = useState(false);
  const you = color === "w" ? "White" : "Black";
  const mine = yourMove ? rows.find((r) => r.uci === yourMove) : undefined;
  const inTree = mine ? [mine] : rows.filter((r) => r.tree);
  const yoursToo = rows.filter((r) => !inTree.includes(r) && (r.yours?.games ?? 0) > 0);
  const rest = rows.filter((r) => !inTree.includes(r) && !yoursToo.includes(r));

  return (
    <div className="flex h-64 shrink-0 flex-col overflow-hidden rounded-card-md ring-1 ring-line-soft">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line-soft px-3">
        <MicroLabel>Explorer</MicroLabel>
        <span className="ml-auto flex items-center gap-2 text-2xs text-fg-muted tabular-nums">
          {reach && (
            <>
              <span title={`Your games as ${you} that reached this position`}>
                {reach.games.toLocaleString()} games
              </span>
              {reach.transposed > 0 && (
                <span
                  className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-sky-200"
                  title={`${reach.transposed.toLocaleString()} of them reached it by another move order (a transposition) — they count towards the folder that owns this position`}
                >
                  ↪ {reach.transposed.toLocaleString()} transposed
                </span>
              )}
            </>
          )}
        </span>
      </div>
      <div
        className={cn(
          GRID,
          "h-7 shrink-0 px-3 text-3xs font-semibold tracking-label text-fg-muted uppercase",
        )}
      >
        <span className="pl-4">Move</span>
        <span
          title={`Your games as ${you} from this position: how many went this way, and your score in them (win 1, draw ½)`}
        >
          You {loading.yours && <Spinner />}
        </span>
        <span title="The lichess database, every rating and speed: how often this move is played here, and how those games ended — White wins / draws / Black wins">
          Lichess {loading.db && <Spinner />}
        </span>
        <span className="text-right" title="The engine's score after this move, from White's side">
          Eval
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {rows.length === 0 && !loading.yours && !loading.db && (
          <p className="px-2 py-4 text-sm text-fg-muted">No moves known from here.</p>
        )}
        {inTree.map((r) => (
          <MoveRow
            key={r.uci}
            fen={fen}
            row={r}
            best={r.uci === bestUci}
            onPlay={onPlay}
            highlight={r === mine}
          />
        ))}
        {yoursToo.length > 0 && (
          <>
            <Divider>{mine ? "Your other moves here" : "Also played against you"}</Divider>
            {yoursToo.map((r) => (
              <MoveRow key={r.uci} fen={fen} row={r} best={r.uci === bestUci} onPlay={onPlay} />
            ))}
          </>
        )}
        {rest.length > 0 &&
          (showRest ? (
            <>
              <Divider>Lichess &amp; engine</Divider>
              {rest.map((r) => (
                <MoveRow key={r.uci} fen={fen} row={r} best={r.uci === bestUci} onPlay={onPlay} />
              ))}
            </>
          ) : (
            <Button
              variant="ghost"
              size="xs"
              className="mt-1 ml-5 text-fg-muted"
              onClick={() => setShowRest(true)}
              title="Moves you've never played here, from the lichess database and the engine"
            >
              + Lichess &amp; engine moves
            </Button>
          ))}
      </div>
      <Legend />
    </div>
  );
}

/** One dot per move: its kind's colour, or two halves when it is two kinds at once. */
function KindDot({ kinds, title }: { kinds: readonly MoveKind[]; title: string }) {
  const [a, b] = kinds;
  if (!a) return null;
  return (
    <span
      className={cn("size-2 rounded-full", !b && KIND[a].dot)}
      style={
        b
          ? { background: `linear-gradient(90deg, ${KIND_COLOR[a]} 50%, ${KIND_COLOR[b]} 50%)` }
          : undefined
      }
      title={title}
    />
  );
}

function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1.5 flex items-center gap-2 px-2 pb-0.5 text-3xs font-semibold tracking-label text-fg-disabled uppercase">
      <span className="shrink-0">{children}</span>
      <span className="h-px flex-1 bg-line-soft" />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex h-8 shrink-0 items-center justify-center gap-4 border-t border-line-soft text-3xs text-fg-muted">
      {(["pick", "engine", "popular"] as const).map((k: MoveKind) => (
        <span key={k} className="flex items-center gap-1.5" title={KIND[k].title}>
          <span className={cn("size-2 rounded-full", KIND[k].dot)} />
          {KIND[k].label}
        </span>
      ))}
      <span
        className="flex items-center gap-1.5"
        title="Two colours: both at once — e.g. a popular reply that is also the engine's best"
      >
        <KindDot kinds={["popular", "engine"]} title="" />
        Both
      </span>
    </div>
  );
}

function MoveRow({
  fen,
  row: r,
  best,
  onPlay,
  highlight = false,
}: {
  fen: string;
  row: ExplorerRow;
  /** The engine's best move here. */
  best: boolean;
  onPlay: (uci: string) => void;
  highlight?: boolean;
}) {
  const score = r.yours ? r.yours.score / Math.max(1, r.yours.games) : null;
  const kinds = kindsOf(r.tree, best);
  const kindTitle = [
    r.tree ? SOURCE_TITLE[r.tree] : null,
    best && (!r.tree || KIND_OF[r.tree] !== "engine")
      ? "Engine — the engine's best move here"
      : null,
  ]
    .filter(Boolean)
    .join("\n");
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the whole row is a click target for the mouse; the move button inside is the keyboard one
    // biome-ignore lint/a11y/useKeyWithClickEvents: as above
    <div
      onClick={() => onPlay(r.uci)}
      className={cn(
        GRID,
        "cursor-pointer rounded-ui-md px-2 py-1.5 text-xs transition",
        highlight
          ? "bg-accent-500/12 ring-1 ring-accent-400/40 ring-inset hover:bg-accent-500/18"
          : "hover:bg-fill-soft",
      )}
    >
      <span className="flex items-center gap-2">
        {/* A fixed slot, dot or not, so every move starts at the same x. */}
        <span className="flex w-2 shrink-0 justify-center">
          {kinds.length > 0 && <KindDot kinds={kinds} title={kindTitle} />}
        </span>
        {/* biome-ignore lint/correctness/noRestrictedElements: the move in a dense explorer row, text only — the row itself is the visual target */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPlay(r.uci);
          }}
          className={cn(
            "font-mono text-sm font-bold",
            r.tree ? "text-fg-strong" : "text-fg-primary",
          )}
          title={r.tree ? SOURCE_TITLE[r.tree] : `Play ${r.san}`}
        >
          {r.san}
        </button>
      </span>
      <span className="flex items-baseline gap-1.5 tabular-nums">
        {r.yours ? (
          <>
            <span className="text-fg-secondary">{compact(r.yours.games)}</span>
            <span
              className={cn("text-3xs", (score ?? 0) >= 0.5 ? "text-emerald-300" : "text-rose-300")}
            >
              {percent(score ?? 0)}
            </span>
          </>
        ) : (
          <span className="text-fg-disabled">—</span>
        )}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        {r.db ? (
          <>
            <span className="w-8 shrink-0 text-right text-2xs tabular-nums text-fg-muted">
              {percent(r.db.share)}
            </span>
            <ResultBar white={r.db.white} draws={r.db.draws} black={r.db.black} />
          </>
        ) : (
          <span className="text-fg-disabled">—</span>
        )}
      </span>
      <span className="text-right font-mono text-2xs tabular-nums text-fg-primary">
        {r.engine ? scoreText(fen, r.engine) : <span className="text-fg-disabled">—</span>}
      </span>
    </div>
  );
}

/** lichess's result bar: White / draw / Black, with the share written in when it fits. */
function ResultBar({ white, draws, black }: { white: number; draws: number; black: number }) {
  const total = Math.max(1, white + draws + black);
  const parts = [
    { n: white, cls: "bg-fg-strong text-surface-950" },
    { n: draws, cls: "bg-fg-muted/70 text-surface-950" },
    { n: black, cls: "bg-surface-950 text-fg-secondary ring-1 ring-line ring-inset" },
  ];
  return (
    <span
      className="flex h-4 min-w-0 flex-1 overflow-hidden rounded-ui-md text-3xs font-semibold tabular-nums"
      title={`${total.toLocaleString()} games — White wins ${percent(white / total)} · draws ${percent(draws / total)} · Black wins ${percent(black / total)}`}
    >
      {parts.map((p, i) => {
        const share = p.n / total;
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: always the same three segments
            key={i}
            className={cn("flex items-center justify-center overflow-hidden", p.cls)}
            style={{ width: `${share * 100}%` }}
          >
            {share >= 0.2 ? percent(share) : ""}
          </span>
        );
      })}
    </span>
  );
}
