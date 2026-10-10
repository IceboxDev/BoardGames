import {
  fileOf,
  findKing,
  inCheck,
  parseSquare,
  rankOf,
  squareName,
} from "@boardgames/core/games/chess/engine/board";
import { parseFen } from "@boardgames/core/games/chess/engine/fen";
import type { Color, PieceChar, Position } from "@boardgames/core/games/chess/engine/types";
import { motion, useReducedMotion } from "framer-motion";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { BoardLayer, BoardSurface } from "../../../../components/board";
import { boardSpring } from "../../../../components/board/motion";
import { type MoveMap, moveMap, movesBetween, premoveMap, uciFrom, uciTo } from "../../logic/moves";
import { BOARD_COLORS, BOARD_SIZE, SQUARE } from "./palette";
import { PIECE_URL, pieceName } from "./pieces";

export interface BoardArrow {
  readonly from: string;
  readonly to: string;
  readonly tone: "best" | "user" | "alt";
}

export interface ChessBoardProps {
  readonly fen: string;
  /** The colour at the bottom of the board. */
  readonly orientation: Color;
  /** Moves the viewer may play right now (UCI). Empty: nothing to play. */
  readonly moves: readonly string[];
  readonly onMove?: (uci: string) => void;
  /**
   * The viewer's colour while it is the opponent's turn: pieces of this colour
   * can be pre-moved (`onPremove`). `null` turns premoves off.
   */
  readonly premoveColor?: Color | null;
  readonly premove?: string | null;
  readonly onPremove?: (uci: string | null) => void;
  readonly lastMove?: string | null;
  readonly arrows?: readonly BoardArrow[];
  /** Bughouse: the pocket piece picked to drop (`"N@"`), chosen outside the board. */
  readonly dropKey?: string | null;
  readonly onDropKeyChange?: (key: string | null) => void;
  readonly bughouse?: boolean;
  readonly "aria-label"?: string;
  readonly className?: string;
}

/** Square index → top-left corner in board units, for this orientation. */
function corner(sq: number, orientation: Color): { x: number; y: number } {
  const col = orientation === "w" ? fileOf(sq) : 7 - fileOf(sq);
  const row = orientation === "w" ? 7 - rankOf(sq) : rankOf(sq);
  return { x: col * SQUARE, y: row * SQUARE };
}

function squareAtPoint(x: number, y: number, orientation: Color): number | null {
  if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return null;
  const col = Math.floor(x / SQUARE);
  const row = Math.floor(y / SQUARE);
  const file = orientation === "w" ? col : 7 - col;
  const rank = orientation === "w" ? 7 - row : row;
  return rank * 8 + file;
}

const center = (sq: number, orientation: Color) => {
  const c = corner(sq, orientation);
  return { x: c.x + SQUARE / 2, y: c.y + SQUARE / 2 };
};

function safePosition(fen: string, bughouse: boolean): Position | null {
  try {
    return parseFen(fen, { bughouse });
  } catch {
    return null;
  }
}

let nextPieceId = 1;

/**
 * Stable ids for the pieces, so a moved piece SLIDES rather than one vanishing
 * and another appearing. A piece keeps its id while its square keeps its
 * letter; the last move hands the mover's id from `from` to `to` (and the
 * castling rook's along with it).
 */
function trackIds(
  prev: { board: readonly (PieceChar | null)[]; ids: (number | null)[] } | null,
  board: readonly (PieceChar | null)[],
  lastMove: string | null,
): (number | null)[] {
  const ids: (number | null)[] = board.map((p, sq) =>
    p && prev && prev.board[sq] === p ? (prev.ids[sq] ?? null) : null,
  );
  if (prev && lastMove && !lastMove.includes("@")) {
    const from = parseSquare(lastMove.slice(0, 2));
    const to = parseSquare(lastMove.slice(2, 4));
    if (from !== null && to !== null && prev.ids[from] != null && board[to]) {
      ids[to] = prev.ids[from] ?? null;
      const piece = prev.board[from];
      if (piece && piece.toLowerCase() === "k" && Math.abs(to - from) === 2) {
        const rookFrom = to > from ? from + 3 : from - 4;
        const rookTo = to > from ? from + 1 : from - 1;
        if (prev.ids[rookFrom] != null) ids[rookTo] = prev.ids[rookFrom] ?? null;
      }
    }
  }
  return ids.map((id, sq) => (board[sq] ? (id ?? nextPieceId++) : null));
}

interface Drag {
  readonly from: string;
  readonly piece: PieceChar;
  readonly x: number;
  readonly y: number;
  readonly moved: boolean;
}

interface Promotion {
  readonly from: string;
  readonly to: number;
  readonly options: readonly string[];
}

const PROMOTION_ORDER = ["q", "n", "r", "b"];
const SQUARES: readonly number[] = Array.from({ length: 64 }, (_, sq) => sq);
const EIGHT: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * The chess board: an 800×800 SVG on the shared `BoardSurface`. Click a piece
 * then a square, or drag; promotions open a picker on the board. Keyboard:
 * arrows move a cursor, Enter/Space picks up and puts down, Esc lets go.
 * Right-drag draws an arrow; any left click clears them.
 */
export default function ChessBoard({
  fen,
  orientation,
  moves,
  onMove,
  premoveColor = null,
  premove = null,
  onPremove,
  lastMove = null,
  arrows = [],
  dropKey = null,
  onDropKeyChange,
  bughouse = false,
  "aria-label": ariaLabel = "Chess board",
  className,
}: ChessBoardProps) {
  const reduceMotion = useReducedMotion();
  const checkId = useId();
  const arrowId = useId();
  const position = useMemo(() => safePosition(fen, bughouse), [fen, bughouse]);
  const board = position?.board ?? [];

  const idsRef = useRef<{
    fen: string;
    board: readonly (PieceChar | null)[];
    ids: (number | null)[];
  } | null>(null);
  if (position && idsRef.current?.fen !== fen) {
    idsRef.current = {
      fen,
      board: position.board,
      ids: trackIds(idsRef.current, position.board, lastMove),
    };
  }
  const ids = idsRef.current?.ids ?? [];

  const playing = moves.length > 0;
  const active: MoveMap = useMemo(() => {
    if (playing) return moveMap(moves);
    if (premoveColor && onPremove) return premoveMap(fen, premoveColor, bughouse);
    return new Map();
  }, [playing, moves, premoveColor, onPremove, fen, bughouse]);

  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [cursor, setCursor] = useState<number>(orientation === "w" ? 12 : 52);
  const [focused, setFocused] = useState(false);
  // The cursor is for keyboard play: hidden after a click, shown on a key press.
  const [usingKeys, setUsingKeys] = useState(false);
  const [userArrows, setUserArrows] = useState<{ from: number; to: number }[]>([]);
  const rightFrom = useRef<number | null>(null);
  const layerRef = useRef<SVGGElement | null>(null);

  // A pocket piece picked outside the board acts as the selection.
  const from = dropKey ?? selected;

  const toLocal = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = layerRef.current?.ownerSVGElement;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(null);
    onDropKeyChange?.(null);
  }, [onDropKeyChange]);

  const commit = useCallback(
    (uci: string) => {
      clearSelection();
      setPromotion(null);
      if (playing) onMove?.(uci);
      else onPremove?.(uci);
    },
    [clearSelection, playing, onMove, onPremove],
  );

  const selectable = useCallback(
    (sq: number) => {
      const p = board[sq];
      return !!p && active.has(squareName(sq));
    },
    [board, active],
  );

  /** Try to move the current selection to `sq`. Returns whether it was handled. */
  const tryMove = useCallback(
    (origin: string, sq: number): boolean => {
      const candidates = movesBetween(active, origin, squareName(sq));
      if (candidates.length === 0) return false;
      if (candidates.length === 1) {
        commit(candidates[0] ?? "");
        return true;
      }
      // Several moves to one square are the promotion choices.
      const options = [...candidates].sort(
        (a, b) => PROMOTION_ORDER.indexOf(a.slice(4)) - PROMOTION_ORDER.indexOf(b.slice(4)),
      );
      setPromotion({ from: origin, to: sq, options });
      return true;
    },
    [active, commit],
  );

  const press = useCallback(
    (sq: number) => {
      if (promotion) return;
      if (from && tryMove(from, sq)) return;
      if (selectable(sq)) {
        onDropKeyChange?.(null);
        setSelected(squareName(sq));
        return;
      }
      if (!playing && premove) onPremove?.(null);
      clearSelection();
    },
    [
      promotion,
      from,
      tryMove,
      selectable,
      onDropKeyChange,
      playing,
      premove,
      onPremove,
      clearSelection,
    ],
  );

  const onPointerDown = (e: PointerEvent<SVGRectElement>) => {
    setUsingKeys(false);
    const p = toLocal(e);
    if (!p) return;
    const sq = squareAtPoint(p.x, p.y, orientation);
    if (sq === null) return;
    if (e.button === 2) {
      rightFrom.current = sq;
      return;
    }
    if (e.button !== 0) return;
    setUserArrows([]);
    const piece = board[sq];
    const wasSelected = from;
    press(sq);
    if (
      piece &&
      selectable(sq) &&
      !(wasSelected && movesBetween(active, wasSelected, squareName(sq)).length)
    ) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ from: squareName(sq), piece, x: p.x, y: p.y, moved: false });
    }
  };

  const onPointerMove = (e: PointerEvent<SVGRectElement>) => {
    if (!drag) return;
    const p = toLocal(e);
    if (!p) return;
    const moved = drag.moved || Math.hypot(p.x - drag.x, p.y - drag.y) > 6;
    setDrag({ ...drag, x: p.x, y: p.y, moved });
  };

  const onPointerUp = (e: PointerEvent<SVGRectElement>) => {
    const p = toLocal(e);
    const sq = p ? squareAtPoint(p.x, p.y, orientation) : null;
    if (e.button === 2) {
      const start = rightFrom.current;
      rightFrom.current = null;
      if (start !== null && sq !== null && sq !== start) {
        setUserArrows((list) => {
          const exists = list.some((a) => a.from === start && a.to === sq);
          return exists
            ? list.filter((a) => !(a.from === start && a.to === sq))
            : [...list, { from: start, to: sq }];
        });
      }
      return;
    }
    if (drag?.moved) {
      if (sq !== null && squareName(sq) !== drag.from && !tryMove(drag.from, sq)) clearSelection();
    }
    setDrag(null);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    setUsingKeys(true);
    const step = (df: number, dr: number) => {
      // Arrow keys follow the screen, so flip them for Black's view.
      const sign = orientation === "w" ? 1 : -1;
      const f = Math.min(7, Math.max(0, fileOf(cursor) + df * sign));
      const r = Math.min(7, Math.max(0, rankOf(cursor) + dr * sign));
      setCursor(r * 8 + f);
    };
    switch (e.key) {
      case "ArrowUp":
        step(0, 1);
        break;
      case "ArrowDown":
        step(0, -1);
        break;
      case "ArrowLeft":
        step(-1, 0);
        break;
      case "ArrowRight":
        step(1, 0);
        break;
      case "Enter":
      case " ":
        if (promotion) commit(promotion.options[0] ?? "");
        else press(cursor);
        break;
      case "Escape":
        setPromotion(null);
        clearSelection();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const checkSquare =
    position && inCheck(position) ? findKing(position.board, position.turn) : null;
  const targets = from ? (active.get(from) ?? []) : [];
  const premoveSquares = premove
    ? [uciFrom(premove), uciTo(premove)].flatMap((s) => {
        const sq = s ? parseSquare(s) : null;
        return sq === null ? [] : [sq];
      })
    : [];
  const lastSquares =
    lastMove != null
      ? [uciFrom(lastMove), uciTo(lastMove)].flatMap((s) => {
          const sq = s ? parseSquare(s) : null;
          return sq === null ? [] : [sq];
        })
      : [];
  const selectedSq = selected ? parseSquare(selected) : null;
  const allArrows = [
    ...arrows.flatMap((a) => {
      const f = parseSquare(a.from);
      const t = parseSquare(a.to);
      return f === null || t === null ? [] : [{ from: f, to: t, tone: a.tone }];
    }),
    ...userArrows.map((a) => ({ ...a, tone: "user" as const })),
  ];

  return (
    <BoardSurface
      viewBox={{ x: 0, y: 0, width: BOARD_SIZE, height: BOARD_SIZE }}
      aria-label={ariaLabel}
      className={className}
      svgProps={{
        tabIndex: 0,
        onKeyDown,
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
        onContextMenu: (e) => e.preventDefault(),
        style: { touchAction: "none", outline: "none", userSelect: "none" },
      }}
    >
      <BoardLayer name="squares">
        {SQUARES.map((sq) => {
          const { x, y } = corner(sq, orientation);
          const light = (fileOf(sq) + rankOf(sq)) % 2 === 1;
          return (
            <rect
              key={sq}
              x={x}
              y={y}
              width={SQUARE}
              height={SQUARE}
              fill={light ? BOARD_COLORS.light : BOARD_COLORS.dark}
            />
          );
        })}
      </BoardLayer>

      <BoardLayer name="coords">
        {EIGHT.map((i) => {
          const fileSq = orientation === "w" ? i : 7 - i; // bottom row, left to right
          const bottomSq = orientation === "w" ? fileSq : 56 + fileSq;
          const lightBottom = (fileOf(bottomSq) + rankOf(bottomSq)) % 2 === 1;
          const leftSq = orientation === "w" ? (7 - i) * 8 : i * 8 + 7;
          const lightLeft = (fileOf(leftSq) + rankOf(leftSq)) % 2 === 1;
          return (
            <g
              key={i}
              aria-hidden
              fontSize={18}
              fontWeight={700}
              fontFamily="ui-sans-serif, system-ui"
            >
              <text
                x={i * SQUARE + SQUARE - 6}
                y={BOARD_SIZE - 6}
                textAnchor="end"
                fill={lightBottom ? BOARD_COLORS.coordOnLight : BOARD_COLORS.coordOnDark}
              >
                {"abcdefgh"[orientation === "w" ? i : 7 - i]}
              </text>
              <text
                x={5}
                y={i * SQUARE + 20}
                fill={lightLeft ? BOARD_COLORS.coordOnLight : BOARD_COLORS.coordOnDark}
              >
                {orientation === "w" ? 8 - i : i + 1}
              </text>
            </g>
          );
        })}
      </BoardLayer>

      <BoardLayer name="highlights">
        {lastSquares.map((sq) => {
          const { x, y } = corner(sq, orientation);
          return (
            <rect
              key={`last-${sq}`}
              x={x}
              y={y}
              width={SQUARE}
              height={SQUARE}
              fill={BOARD_COLORS.lastMove}
            />
          );
        })}
        {premoveSquares.map((sq) => {
          const { x, y } = corner(sq, orientation);
          return (
            <rect
              key={`pre-${sq}`}
              x={x}
              y={y}
              width={SQUARE}
              height={SQUARE}
              fill={BOARD_COLORS.premove}
            />
          );
        })}
        {selectedSq !== null && (
          <rect
            {...corner(selectedSq, orientation)}
            width={SQUARE}
            height={SQUARE}
            fill={BOARD_COLORS.selected}
          />
        )}
        {checkSquare !== null && checkSquare >= 0 && (
          <circle
            cx={center(checkSquare, orientation).x}
            cy={center(checkSquare, orientation).y}
            r={SQUARE * 0.48}
            fill={`url(#${checkId})`}
          />
        )}
        <defs>
          <radialGradient id={checkId}>
            <stop offset="0%" stopColor={BOARD_COLORS.check} />
            <stop offset="70%" stopColor={BOARD_COLORS.check} stopOpacity={0.4} />
            <stop offset="100%" stopColor={BOARD_COLORS.check} stopOpacity={0} />
          </radialGradient>
          <marker id={arrowId} markerWidth="4" markerHeight="4" refX="2.2" refY="2" orient="auto">
            <path d="M0,0 L4,2 L0,4 Z" fill="context-stroke" />
          </marker>
        </defs>
      </BoardLayer>

      <BoardLayer name="pieces">
        {board.map((piece, sq) => {
          if (!piece) return null;
          const id = ids[sq];
          const { x, y } = corner(sq, orientation);
          const dragging = drag?.moved && drag.from === squareName(sq);
          return (
            <motion.g
              key={id ?? `sq-${sq}`}
              initial={false}
              animate={{ x, y, opacity: dragging ? 0.35 : 1 }}
              transition={reduceMotion ? { duration: 0 } : boardSpring}
            >
              <image
                href={PIECE_URL[piece]}
                width={SQUARE}
                height={SQUARE}
                aria-label={pieceName(piece)}
              />
            </motion.g>
          );
        })}
      </BoardLayer>

      <BoardLayer name="targets">
        {targets.map((uci) => {
          const sq = parseSquare(uciTo(uci));
          if (sq === null) return null;
          const c = center(sq, orientation);
          return board[sq] ? (
            <circle
              key={uci}
              cx={c.x}
              cy={c.y}
              r={SQUARE * 0.44}
              fill="none"
              stroke={BOARD_COLORS.legalDot}
              strokeWidth={8}
            />
          ) : (
            <circle key={uci} cx={c.x} cy={c.y} r={SQUARE * 0.15} fill={BOARD_COLORS.legalDot} />
          );
        })}
      </BoardLayer>

      <BoardLayer name="arrows">
        {allArrows.map((a) => {
          const s = center(a.from, orientation);
          const t = center(a.to, orientation);
          const len = Math.hypot(t.x - s.x, t.y - s.y);
          const end = { x: t.x - ((t.x - s.x) / len) * 22, y: t.y - ((t.y - s.y) / len) * 22 };
          const color =
            a.tone === "best"
              ? BOARD_COLORS.arrowBest
              : a.tone === "alt"
                ? BOARD_COLORS.arrowAlt
                : BOARD_COLORS.arrowUser;
          return (
            <line
              key={`${a.from}-${a.to}-${a.tone}`}
              x1={s.x}
              y1={s.y}
              x2={end.x}
              y2={end.y}
              stroke={color}
              strokeWidth={16}
              strokeLinecap="round"
              markerEnd={`url(#${arrowId})`}
              pointerEvents="none"
            />
          );
        })}
      </BoardLayer>

      {focused && usingKeys && (
        <rect
          {...corner(cursor, orientation)}
          width={SQUARE}
          height={SQUARE}
          fill="none"
          stroke={BOARD_COLORS.cursor}
          strokeWidth={6}
          pointerEvents="none"
        />
      )}

      {/* The hit area for every pointer gesture. */}
      <g ref={layerRef}>
        <rect
          x={0}
          y={0}
          width={BOARD_SIZE}
          height={BOARD_SIZE}
          fill="transparent"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
        />
      </g>

      {drag?.moved && (
        <image
          href={PIECE_URL[drag.piece]}
          x={drag.x - SQUARE * 0.55}
          y={drag.y - SQUARE * 0.55}
          width={SQUARE * 1.1}
          height={SQUARE * 1.1}
          pointerEvents="none"
        />
      )}

      {promotion && (
        <PromotionPicker
          promotion={promotion}
          orientation={orientation}
          color={position?.turn === "b" ? "b" : "w"}
          premoveColor={playing ? null : premoveColor}
          onPick={commit}
          onCancel={() => {
            setPromotion(null);
            clearSelection();
          }}
        />
      )}
    </BoardSurface>
  );
}

function PromotionPicker({
  promotion,
  orientation,
  color,
  premoveColor,
  onPick,
  onCancel,
}: {
  promotion: Promotion;
  orientation: Color;
  color: Color;
  premoveColor: Color | null;
  onPick: (uci: string) => void;
  onCancel: () => void;
}) {
  const mover = premoveColor ?? color;
  const { x, y } = corner(promotion.to, orientation);
  // The column grows from the promotion square toward the board's middle.
  const down = y === 0;
  return (
    <g>
      <rect
        x={0}
        y={0}
        width={BOARD_SIZE}
        height={BOARD_SIZE}
        fill={BOARD_COLORS.pickerScrim}
        onPointerDown={onCancel}
      />
      {promotion.options.map((uci, i) => {
        const type = uci.slice(4);
        const piece = (mover === "w" ? type.toUpperCase() : type) as PieceChar;
        const ty = down ? y + i * SQUARE : y - i * SQUARE;
        return (
          // biome-ignore lint/a11y/useSemanticElements: SVG has no <button>; this group is the button.
          <g
            key={uci}
            role="button"
            tabIndex={-1}
            aria-label={`Promote to ${pieceName(piece).split(" ")[1]}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              onPick(uci);
            }}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={x + SQUARE / 2}
              cy={ty + SQUARE / 2}
              r={SQUARE * 0.48}
              fill={BOARD_COLORS.pickerTile}
            />
            <image
              href={PIECE_URL[piece]}
              x={x + 5}
              y={ty + 5}
              width={SQUARE - 10}
              height={SQUARE - 10}
            />
          </g>
        );
      })}
    </g>
  );
}
