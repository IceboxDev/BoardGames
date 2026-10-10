import { toGtp } from "@boardgames/core/games/go/coords";
import { starPoints } from "@boardgames/core/games/go/handicap";
import type { Cell, Color } from "@boardgames/core/games/go/types";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useId,
  useMemo,
  useState,
} from "react";
import { BoardSurface } from "../../../../components/board";
import { useMediaQuery } from "../../../../hooks/useMediaQuery";
import {
  CELL,
  geometry,
  MARGIN,
  MARK,
  nearestPoint,
  pointXY,
  STONE,
  STONE_R,
  WOOD,
} from "./geometry";

/** A number or short label drawn on a point (analysis, review). */
export interface BoardMark {
  readonly point: number;
  readonly label?: string;
  readonly tone: "best" | "info";
}

export interface GoBoardProps {
  readonly size: number;
  readonly board: readonly Cell[];
  readonly lastMove?: number | null;
  readonly koPoint?: number | null;
  /** Points a click/tap acts on; empty = the board is inert. */
  readonly active?: ReadonlySet<number>;
  /** The colour of the ghost stone under the cursor while placing. */
  readonly ghost?: Color | null;
  readonly onPoint?: (point: number) => void;
  /** Scoring: stones marked dead (drawn faded with a cross). */
  readonly dead?: ReadonlySet<number>;
  /** Scoring/analysis: owner per point (0 black, 1 white, -1 nobody). */
  readonly ownership?: readonly number[] | null;
  readonly marks?: readonly BoardMark[];
  /** Phones: the first tap previews, a second tap on the same point plays. */
  readonly confirmTaps?: boolean;
  readonly className?: string;
}

/**
 * The Go board: wood, grid, star points, coordinates, stones and the marks
 * on them. One transparent rect turns the pointer into a point, rather than
 * hundreds of hit targets; the keyboard drives a cursor (arrows + Enter).
 */
export default function GoBoard({
  size,
  board,
  lastMove = null,
  koPoint = null,
  active,
  ghost = null,
  onPoint,
  dead,
  ownership,
  marks,
  confirmTaps,
  className,
}: GoBoardProps) {
  const g = geometry(size);
  const reduceMotion = useReducedMotion();
  const coarse = useMediaQuery("(pointer: coarse)");
  const confirm = confirmTaps ?? coarse;
  const [hover, setHover] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const interactive = !!onPoint && !!active && active.size > 0;
  const stars = useMemo(() => starPoints(size), [size]);
  const uid = useId();
  const ids = { black: `${uid}-b`, white: `${uid}-w`, wood: `${uid}-wood` };

  const pointAt = useCallback(
    (e: PointerEvent<SVGRectElement>): number | null => {
      const svg = e.currentTarget.ownerSVGElement;
      const ctm = svg?.getScreenCTM();
      if (!svg || !ctm) return null;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const local = pt.matrixTransform(ctm.inverse());
      return nearestPoint(size, local.x, local.y);
    },
    [size],
  );

  const act = useCallback(
    (p: number | null, viaTouch: boolean) => {
      if (p === null || !interactive || !active?.has(p)) return;
      if (confirm && viaTouch && pending !== p) {
        setPending(p);
        return;
      }
      setPending(null);
      onPoint?.(p);
    },
    [active, confirm, interactive, onPoint, pending],
  );

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const at = cursor ?? Math.floor((size * size) / 2);
    const x = at % size;
    const y = Math.floor(at / size);
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const step = moves[e.key];
    if (step) {
      e.preventDefault();
      const nx = Math.min(size - 1, Math.max(0, x + step[0]));
      const ny = Math.min(size - 1, Math.max(0, y + step[1]));
      setCursor(ny * size + nx);
    } else if ((e.key === "Enter" || e.key === " ") && cursor !== null) {
      e.preventDefault();
      act(cursor, false);
    }
  };

  const preview = pending ?? (interactive && hover !== null && active?.has(hover) ? hover : null);
  const lineEnd = MARGIN + (size - 1) * CELL;
  const cursorLabel =
    cursor === null
      ? undefined
      : `${toGtp(size, cursor)}, ${board[cursor] === 1 ? "black" : board[cursor] === 2 ? "white" : "empty"}`;

  return (
    <BoardSurface
      viewBox={g.viewBox}
      aria-label={
        cursorLabel ? `Go board, cursor on ${cursorLabel}` : `${size} by ${size} Go board`
      }
      className={className}
      svgProps={{
        tabIndex: 0,
        onKeyDown: onKey,
        onBlur: () => setCursor(null),
        style: { touchAction: "manipulation" },
      }}
    >
      <defs>
        <radialGradient id={ids.black} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor={STONE.black.hi} />
          <stop offset="100%" stopColor={STONE.black.lo} />
        </radialGradient>
        <radialGradient id={ids.white} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={STONE.white.hi} />
          <stop offset="100%" stopColor={STONE.white.lo} />
        </radialGradient>
        <linearGradient id={ids.wood} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={WOOD.light} />
          <stop offset="100%" stopColor={WOOD.dark} />
        </linearGradient>
      </defs>

      {/* Wood and grid */}
      <g aria-hidden pointerEvents="none">
        <rect x={0} y={0} width={g.extent} height={g.extent} rx={18} fill={`url(#${ids.wood})`} />
        {Array.from({ length: size }, (_, i) => {
          const at = MARGIN + i * CELL;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: a line index is the identity
            <g key={i}>
              <line
                x1={MARGIN}
                y1={at}
                x2={lineEnd}
                y2={at}
                stroke={WOOD.line}
                strokeWidth={i === 0 || i === size - 1 ? 5 : 2.5}
              />
              <line
                x1={at}
                y1={MARGIN}
                x2={at}
                y2={lineEnd}
                stroke={WOOD.line}
                strokeWidth={i === 0 || i === size - 1 ? 5 : 2.5}
              />
              <text
                x={at}
                y={MARGIN * 0.33}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={34}
                fill={WOOD.label}
              >
                {g.columns[i]}
              </text>
              <text
                x={at}
                y={g.extent - MARGIN * 0.33}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={34}
                fill={WOOD.label}
              >
                {g.columns[i]}
              </text>
              <text
                x={MARGIN * 0.33}
                y={at}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={34}
                fill={WOOD.label}
              >
                {size - i}
              </text>
              <text
                x={g.extent - MARGIN * 0.33}
                y={at}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={34}
                fill={WOOD.label}
              >
                {size - i}
              </text>
            </g>
          );
        })}
        {stars.map((p) => {
          const { x, y } = pointXY(size, p);
          return <circle key={p} cx={x} cy={y} r={9} fill={WOOD.line} />;
        })}
      </g>

      {/* Territory (scoring / analysis) */}
      {ownership && (
        <g aria-hidden pointerEvents="none">
          {ownership.map((owner, p) => {
            const occupied = board[p] !== 0 && !dead?.has(p);
            if (owner < 0 || occupied) return null;
            const { x, y } = pointXY(size, p);
            const s = CELL * 0.32;
            return (
              <rect
                // biome-ignore lint/suspicious/noArrayIndexKey: a point index is the identity
                key={p}
                x={x - s / 2}
                y={y - s / 2}
                width={s}
                height={s}
                fill={owner === 0 ? MARK.blackArea : MARK.whiteArea}
                stroke={owner === 0 ? MARK.whiteArea : MARK.blackArea}
                strokeWidth={2}
              />
            );
          })}
        </g>
      )}

      {/* Stones */}
      <g pointerEvents="none">
        <AnimatePresence initial={false}>
          {board.map((cell, p) => {
            if (cell === 0) return null;
            const { x, y } = pointXY(size, p);
            const black = cell === 1;
            const isDead = dead?.has(p) ?? false;
            return (
              <motion.g
                // biome-ignore lint/suspicious/noArrayIndexKey: point + colour is the stone's identity
                key={`${p}-${cell}`}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
                animate={{ opacity: isDead ? 0.45 : 1, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.16 }}
                style={{ transformOrigin: `${x}px ${y}px`, transformBox: "view-box" }}
              >
                <circle cx={x + 4} cy={y + 6} r={STONE_R} fill="rgba(0,0,0,0.25)" />
                <circle
                  cx={x}
                  cy={y}
                  r={STONE_R}
                  fill={black ? `url(#${ids.black})` : `url(#${ids.white})`}
                  stroke={black ? STONE.black.rim : STONE.white.rim}
                  strokeWidth={2}
                />
                {isDead && (
                  <path
                    d={`M${x - 18} ${y - 18}L${x + 18} ${y + 18}M${x + 18} ${y - 18}L${x - 18} ${y + 18}`}
                    stroke={black ? MARK.lastOnBlack : MARK.lastOnWhite}
                    strokeWidth={7}
                    strokeLinecap="round"
                  />
                )}
              </motion.g>
            );
          })}
        </AnimatePresence>
      </g>

      {/* Marks: last move, ko, analysis labels, cursor */}
      <g aria-hidden pointerEvents="none">
        {lastMove !== null && board[lastMove] !== 0 && (
          <circle
            cx={pointXY(size, lastMove).x}
            cy={pointXY(size, lastMove).y}
            r={STONE_R * 0.42}
            fill="none"
            stroke={board[lastMove] === 1 ? MARK.lastOnBlack : MARK.lastOnWhite}
            strokeWidth={7}
          />
        )}
        {koPoint !== null && (
          <rect
            x={pointXY(size, koPoint).x - 20}
            y={pointXY(size, koPoint).y - 20}
            width={40}
            height={40}
            fill="none"
            stroke={MARK.ko}
            strokeWidth={6}
          />
        )}
        {marks?.map((m) => {
          const { x, y } = pointXY(size, m.point);
          const onStone = board[m.point] !== 0;
          return (
            <g key={`m${m.point}`}>
              {!onStone && (
                <circle
                  cx={x}
                  cy={y}
                  r={STONE_R * 0.8}
                  fill={m.tone === "best" ? MARK.best : WOOD.light}
                  opacity={0.9}
                />
              )}
              {m.label && (
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={38}
                  fontWeight={700}
                  fill={
                    onStone
                      ? board[m.point] === 1
                        ? MARK.lastOnBlack
                        : MARK.lastOnWhite
                      : MARK.lastOnWhite
                  }
                >
                  {m.label}
                </text>
              )}
            </g>
          );
        })}
        {preview !== null && ghost !== null && board[preview] === 0 && (
          <circle
            cx={pointXY(size, preview).x}
            cy={pointXY(size, preview).y}
            r={STONE_R}
            fill={ghost === 0 ? `url(#${ids.black})` : `url(#${ids.white})`}
            opacity={pending !== null ? 0.8 : 0.5}
          />
        )}
        {cursor !== null && (
          <rect
            x={pointXY(size, cursor).x - CELL / 2}
            y={pointXY(size, cursor).y - CELL / 2}
            width={CELL}
            height={CELL}
            fill="none"
            stroke={MARK.best}
            strokeWidth={6}
            rx={10}
          />
        )}
      </g>

      {/* The one hit target */}
      <rect
        x={0}
        y={0}
        width={g.extent}
        height={g.extent}
        fill="transparent"
        style={{
          cursor: interactive && hover !== null && active?.has(hover) ? "pointer" : "default",
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse") setHover(pointAt(e));
        }}
        onPointerLeave={() => setHover(null)}
        onPointerUp={(e) => act(pointAt(e), e.pointerType !== "mouse")}
      />
    </BoardSurface>
  );
}
