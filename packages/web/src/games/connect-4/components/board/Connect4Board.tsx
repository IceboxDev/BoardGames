import type { Cell, MoveRecord, Seat } from "@boardgames/core/games/connect-4/types";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  BoardLayer,
  BoardSurface,
  pulseRingAnimation,
  pulseRingTransition,
} from "../../../../components/board";
import { placedDiscs } from "./discs";
import {
  boardGeometry,
  CELL,
  cellX,
  cellY,
  DISC_R,
  FRAME,
  facePath,
  HOVER_STRIP,
  hoverY,
  POP_STRIP,
} from "./geometry";
import { type BoardMotion, discMotion } from "./motion";
import {
  DISC_COLORS,
  DRAW_FILL,
  FACE_EDGE,
  FACE_FILL,
  HIGHLIGHT_FILL,
  MARK_FILL,
  seatInk,
  WELL_FILL,
} from "./palette";

/** A label over a column (analysis: what dropping there leads to). */
export interface ColumnMark {
  column: number;
  /** "#7", "=", "?" — empty while it is being worked out. */
  label: string;
  /** The colour that wins, a draw, or not known. */
  tone: Seat | "draw" | "unknown";
  /** One of the best columns. */
  best: boolean;
  /** Its meaning, for a tooltip. */
  title: string;
}

/** A ring and badge on the newest disc (analysis: the selected move's grade). */
export interface LastMoveMark {
  color: string;
  /** "??", "?", "?!" — or empty for a ring alone. */
  badge: string;
}

export interface Connect4BoardProps {
  cols: number;
  rows: number;
  popOut: boolean;
  /** Which game of a series — discs of a new game drop in fresh. */
  gameIndex: number;
  moves: readonly MoveRecord[];
  winningCells: readonly Cell[];
  /** The colour that would drop next (the hovering disc). */
  toMove: Seat;
  /** Columns the viewer may drop into / pop now. Empty when it isn't their move. */
  droppable: readonly number[];
  poppable: readonly number[];
  onDrop?: (column: number) => void;
  onPop?: (column: number) => void;
  /** Columns to point out (a hint, the best moves in analysis). */
  highlight?: readonly number[];
  /** Pop arrows to point out (a PopOut hint). */
  highlightPops?: readonly number[];
  /** Keyboard-focused column (shown like a hover). */
  focusColumn?: number | null;
  /** Live play, or the analysis board (fades discs out when stepping back). */
  motionMode?: BoardMotion;
  /** Labels in the strip over the columns. */
  columnMarks?: readonly ColumnMark[];
  /** Marks the newest disc in place of the plain last-move dot. */
  lastMoveMark?: LastMoveMark | null;
  /** Translucent discs where a move could have gone instead. */
  ghosts?: readonly { column: number; row: number; player: Seat }[];
  /** The column the next move went into (a chevron in the mover's colour). */
  nextColumn?: number | null;
  /** Hovering a column previews the disc where it lands (the strip is busy with marks). */
  previewLanding?: boolean;
  className?: string;
}

/** Column values in the hover strip: the label, a bar under it, the next-move chevron below. */
const MARK_TEXT_Y = 30;
const MARK_BAR_Y = 54;
const MARK_BAR_W = 46;

/** A colour-blind cue on every disc: a ring for Red, a dot for Yellow. */
function DiscMark({ player }: { player: Seat }) {
  return player === 0 ? (
    <circle r={DISC_R * 0.42} fill="none" stroke="rgba(0,0,0,0.22)" strokeWidth={5} />
  ) : (
    <circle r={DISC_R * 0.16} fill="rgba(0,0,0,0.22)" />
  );
}

function Disc({ player, ghost = false }: { player: Seat; ghost?: boolean }) {
  const c = DISC_COLORS[player];
  return (
    <g opacity={ghost ? 0.55 : 1}>
      <circle r={DISC_R} fill={c.fill} stroke={c.rim} strokeWidth={4} />
      <circle r={DISC_R * 0.72} fill="none" stroke={c.rim} strokeOpacity={0.45} strokeWidth={3} />
      <path
        d={`M${-DISC_R * 0.55},${-DISC_R * 0.35} a${DISC_R * 0.62},${DISC_R * 0.62} 0 0,1 ${DISC_R * 0.6},${-DISC_R * 0.3}`}
        fill="none"
        stroke={c.shine}
        strokeOpacity={0.7}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <DiscMark player={player} />
    </g>
  );
}

export default function Connect4Board({
  cols,
  rows,
  popOut,
  gameIndex,
  moves,
  winningCells,
  toMove,
  droppable,
  poppable,
  onDrop,
  onPop,
  highlight = [],
  highlightPops = [],
  focusColumn = null,
  motionMode = "live",
  columnMarks = [],
  lastMoveMark = null,
  ghosts = [],
  nextColumn = null,
  previewLanding = false,
  className,
}: Connect4BoardProps) {
  const reduced = useReducedMotion();
  const g = useMemo(() => boardGeometry(cols, rows, popOut), [cols, rows, popOut]);
  const face = useMemo(() => facePath(g), [g]);
  const discs = useMemo(() => placedDiscs(cols, moves), [cols, moves]);
  const columns = useMemo(() => Array.from({ length: cols }, (_, c) => c), [cols]);
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? focusColumn;
  const last = moves.at(-1);
  const lastDisc = last?.type === "drop" ? discs.find((d) => d.id === moves.length - 1) : undefined;
  // How far each disc falls this move: the new disc from the hover strip, or a
  // popped column's discs one row. Everything else stays put.
  const fallCells = (d: (typeof discs)[number]) =>
    d === lastDisc ? rows - d.row : last?.type === "pop" && d.column === last.column ? 1 : 0;
  const landingRow = (c: number) => discs.filter((d) => d.column === c).length;

  return (
    <BoardSurface
      viewBox={{ x: 0, y: 0, width: g.width, height: g.height }}
      aria-label={`Connect 4 board, ${DISC_COLORS[toMove].name} to move`}
      className={className}
    >
      {/* Wells behind the holes. */}
      <rect
        x={FRAME / 2}
        y={g.faceTop + FRAME / 2}
        width={g.width - FRAME}
        height={rows * CELL + FRAME}
        fill={WELL_FILL}
        aria-hidden
      />

      {/* Hint / best-move columns glow through the holes. */}
      <BoardLayer name="highlights" aria-hidden>
        {highlight.map((c) => (
          <motion.rect
            key={`hl-${c}`}
            x={FRAME + c * CELL + 4}
            y={g.faceTop + FRAME}
            width={CELL - 8}
            height={rows * CELL}
            rx={18}
            fill={HIGHLIGHT_FILL}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.18, 0.4, 0.18] }}
            transition={
              reduced ? { duration: 0 } : { duration: 1.6, repeat: Number.POSITIVE_INFINITY }
            }
          />
        ))}
      </BoardLayer>

      <BoardLayer name="discs" aria-hidden>
        {ghosts.map((ghost) => (
          <g
            key={`ghost-${ghost.column}-${ghost.row}`}
            transform={`translate(${cellX(ghost.column)},${cellY(g, ghost.row)})`}
          >
            <Disc player={ghost.player} ghost />
          </g>
        ))}
        {previewLanding &&
          shown !== null &&
          droppable.includes(shown) &&
          landingRow(shown) < rows && (
            <g transform={`translate(${cellX(shown)},${cellY(g, landingRow(shown))})`}>
              <Disc player={toMove} ghost />
            </g>
          )}
        <AnimatePresence initial={false}>
          {discs.map((d) => (
            <motion.g
              key={`${gameIndex}-${d.id}`}
              {...discMotion(
                {
                  x: cellX(d.column),
                  y: cellY(g, d.row),
                  startY: hoverY(),
                  outY: g.height + DISC_R * 2,
                  fallCells: fallCells(d),
                  rows,
                },
                motionMode,
                reduced === true,
              )}
            >
              <Disc player={d.player} />
            </motion.g>
          ))}
        </AnimatePresence>
      </BoardLayer>

      <path
        d={face}
        fill={FACE_FILL}
        fillRule="evenodd"
        stroke={FACE_EDGE}
        strokeWidth={4}
        aria-hidden
      />

      {/* The disc about to drop, over the hovered column. */}
      {!previewLanding && shown !== null && droppable.includes(shown) && (
        <g transform={`translate(${cellX(shown)},${hoverY()})`} aria-hidden>
          <Disc player={toMove} ghost />
        </g>
      )}

      {/* Winning line and last move. */}
      <BoardLayer name="marks" aria-hidden>
        {winningCells.map((cell) => (
          <motion.circle
            key={`win-${cell.column}-${cell.row}`}
            cx={cellX(cell.column)}
            cy={cellY(g, cell.row)}
            r={DISC_R + 2}
            fill="none"
            stroke={MARK_FILL}
            strokeWidth={7}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            animate={reduced ? undefined : pulseRingAnimation}
            transition={reduced ? undefined : pulseRingTransition}
          />
        ))}
        {/* A ghost's ring sits over the face, so it shows round the hole. */}
        {ghosts.map((ghost) => (
          <circle
            key={`ghost-ring-${ghost.column}-${ghost.row}`}
            cx={cellX(ghost.column)}
            cy={cellY(g, ghost.row)}
            r={DISC_R + 3}
            fill="none"
            stroke={HIGHLIGHT_FILL}
            strokeWidth={5}
            strokeDasharray="9 7"
          />
        ))}
        {lastDisc && lastMoveMark && (
          <g transform={`translate(${cellX(lastDisc.column)},${cellY(g, lastDisc.row)})`}>
            <circle r={DISC_R + 3} fill="none" stroke={lastMoveMark.color} strokeWidth={5} />
            {lastMoveMark.badge && (
              <g transform={`translate(${DISC_R * 0.8},${-DISC_R * 0.8})`}>
                <circle r={17} fill={lastMoveMark.color} stroke={WELL_FILL} strokeWidth={3} />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="var(--font-mono)"
                  fontSize={lastMoveMark.badge.length > 1 ? 16 : 21}
                  fontWeight={700}
                  fill={WELL_FILL}
                >
                  {lastMoveMark.badge}
                </text>
              </g>
            )}
          </g>
        )}
        {lastDisc && !lastMoveMark && winningCells.length === 0 && (
          <circle
            cx={cellX(lastDisc.column)}
            cy={cellY(g, lastDisc.row)}
            r={7}
            fill={MARK_FILL}
            opacity={0.85}
          />
        )}
      </BoardLayer>

      {/* What each column leads to, and where the next move went. */}
      <BoardLayer name="column-marks">
        {columnMarks.map((mark) => {
          const seat = typeof mark.tone === "number" ? mark.tone : null;
          const ink =
            seat !== null
              ? seatInk(seat)
              : mark.tone === "draw"
                ? "var(--color-fg-secondary)"
                : "var(--color-fg-disabled)";
          const bar = seat !== null ? DISC_COLORS[seat].fill : DRAW_FILL;
          return (
            <g
              key={`mark-${mark.column}`}
              transform={`translate(${cellX(mark.column)},0)`}
              opacity={mark.best ? 1 : 0.62}
            >
              <title>{mark.title}</title>
              {mark.label ? (
                <text
                  y={MARK_TEXT_Y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="var(--font-mono)"
                  fontSize={mark.label.length > 3 ? 24 : 30}
                  fontWeight={mark.best ? 700 : 500}
                  style={{ fill: ink }}
                >
                  {mark.label}
                </text>
              ) : (
                <circle
                  cy={MARK_TEXT_Y}
                  r={5}
                  className="animate-pulse"
                  style={{ fill: "var(--color-fg-muted)" }}
                />
              )}
              <rect
                x={-MARK_BAR_W / 2}
                y={MARK_BAR_Y}
                width={MARK_BAR_W}
                height={mark.best ? 6 : 4}
                rx={3}
                fill={bar}
                opacity={mark.label ? (mark.best ? 1 : 0.45) : 0.15}
              />
            </g>
          );
        })}
        {nextColumn !== null && (
          <path
            aria-hidden
            transform={`translate(${cellX(nextColumn)},${HOVER_STRIP - 14})`}
            d="M-11,-6L0,5L11,-6"
            fill="none"
            stroke={DISC_COLORS[toMove].fill}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </BoardLayer>

      {/* Column hit areas: the whole column, hover strip included. */}
      {columns.map((c) => {
        const can = droppable.includes(c);
        return (
          // biome-ignore lint/a11y/useSemanticElements: an SVG column has no <button> equivalent.
          <rect
            key={`col-${c}`}
            role="button"
            tabIndex={-1}
            aria-label={`Drop in column ${c + 1}`}
            aria-disabled={!can}
            x={FRAME + c * CELL}
            y={0}
            width={CELL}
            height={g.faceBottom}
            fill="transparent"
            // The board shows its own focus (the hovering disc); no browser box on click.
            style={{ cursor: can ? "pointer" : "default", outline: "none" }}
            onPointerEnter={() => setHover(c)}
            onPointerLeave={() => setHover((h) => (h === c ? null : h))}
            onClick={() => can && onDrop?.(c)}
          />
        );
      })}

      {/* PopOut: an arrow under each bottom disc the viewer may pop. */}
      {popOut &&
        poppable.map((c) => (
          // biome-ignore lint/a11y/useSemanticElements: an SVG arrow has no <button> equivalent.
          <g
            key={`pop-${c}`}
            role="button"
            tabIndex={-1}
            aria-label={`Pop your disc out of column ${c + 1}`}
            transform={`translate(${cellX(c)},${g.faceBottom + POP_STRIP / 2})`}
            style={{ cursor: "pointer", outline: "none" }}
            onClick={() => onPop?.(c)}
          >
            {highlightPops.includes(c) && (
              <motion.circle
                r={31}
                fill="none"
                stroke={HIGHLIGHT_FILL}
                strokeWidth={5}
                animate={reduced ? undefined : { opacity: [0.4, 1, 0.4] }}
                transition={
                  reduced ? undefined : { duration: 1.6, repeat: Number.POSITIVE_INFINITY }
                }
              />
            )}
            <circle
              r={24}
              fill={DISC_COLORS[toMove].fill}
              fillOpacity={0.18}
              stroke={DISC_COLORS[toMove].fill}
              strokeWidth={3}
            />
            <path
              d="M0,-12V10M-9,2L0,12L9,2"
              fill="none"
              stroke={MARK_FILL}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        ))}
    </BoardSurface>
  );
}
