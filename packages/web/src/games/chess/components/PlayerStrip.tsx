import type { Color, PieceType } from "@boardgames/core/games/chess/engine/types";
import type { ClockView } from "@boardgames/core/games/chess/schemas";
import { Badge, Spinner } from "../../../components/ui";
import type { Tone } from "../../../components/ui/tones";
import { cn } from "../../../lib/cn";
import { PIECE_URL } from "./board/pieces";
import { ClockDisplay } from "./ClockDisplay";

interface Props {
  name: string;
  color: Color;
  isAi: boolean;
  thinking: boolean;
  /** Pieces this player has taken. */
  taken: readonly PieceType[];
  /** This player's material lead in pawns, when positive. */
  lead: number;
  clock: ClockView | null;
  disconnected?: boolean;
  toMove: boolean;
  /** A short status after the name: an offer, a refusal, the result. */
  status?: { readonly text: string; readonly tone: Tone } | null;
  /** Tint the whole strip while this player is to move (the chess board; bughouse keeps the dot). */
  highlightTurn?: boolean;
  className?: string;
}

/**
 * One player's row above or below the board: name, colour, what they've
 * captured and their clock.
 */
export function PlayerStrip({
  name,
  color,
  isAi,
  thinking,
  taken,
  lead,
  clock,
  disconnected,
  toMove,
  status,
  highlightTurn,
  className,
}: Props) {
  const capturedColor = color === "w" ? "b" : "w";
  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-center gap-3",
        highlightTurn && "rounded-ui-md px-2 py-0.5",
        highlightTurn && toMove && "bg-fill-strong shadow-[inset_2px_0_0_var(--color-accent-400)]",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-3.5 shrink-0 rounded-full ring-1 ring-line-strong",
          color === "w" ? "bg-white" : "bg-surface-900",
          toMove && "ring-2 ring-accent-400",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-fg-strong">{name}</span>
          {isAi && <Badge tone="sky">AI</Badge>}
          {thinking && <Spinner size="sm" aria-label="Thinking" />}
          {disconnected && !status && <Badge tone="amber">Disconnected</Badge>}
          {status && (
            <Badge tone={status.tone} className="truncate">
              {status.text}
            </Badge>
          )}
        </div>
        <div className="flex h-5 items-center">
          <span className="sr-only">Captured: {taken.join(" ") || "nothing"}</span>
          {taken.map((t, i) => (
            <img
              // biome-ignore lint/suspicious/noArrayIndexKey: identical pieces repeat; order is stable.
              key={`${t}-${i}`}
              src={PIECE_URL[capturedColor === "w" ? (t.toUpperCase() as "P") : (t as "p")]}
              alt=""
              className={cn("size-5", i > 0 && taken[i - 1] === t && "-ml-2.5")}
            />
          ))}
          {lead > 0 && (
            <span className="ml-1 text-xs font-semibold text-fg-secondary">+{lead}</span>
          )}
        </div>
      </div>
      <ClockDisplay clock={clock} color={color} />
    </div>
  );
}
