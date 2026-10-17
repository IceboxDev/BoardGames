import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type { ReactNode } from "react";
import { BoardLayer, BoardOverlay, BoardSurface } from "../../../../components/board";
import { cn } from "../../../../lib/cn";
import { CharacterIcon } from "../../companion/ui";

// The town square: everyone in their chair around a circle, the way the game
// is laid out at a table. Both screens draw it — the Storyteller's with the
// Grimoire on every token, a player's with only what the town knows — so the
// component is presentational: the screen decides what each seat shows.

const SIZE = 1000;
const CENTER = SIZE / 2;
const RADIUS = 390;
const TOKEN = 150;

export type SeatTone = "awake" | "nominee" | "nominator" | "selected" | "picked" | null;

export interface SquareSeat {
  readonly seat: number;
  readonly name: string;
  /** Alive as this screen shows it (the town's view, or the Grimoire's). */
  readonly alive: boolean;
  readonly ghostVote: boolean;
  readonly left?: boolean;
  readonly connected: boolean;
  /** The token on the seat, when this screen may show one. */
  readonly character?: CharacterId;
  /** Small notes under the name (Grimoire reminders, "You"). */
  readonly notes?: readonly string[];
  readonly tone?: SeatTone;
  /** A hand in the current vote: raised, and whether the clock has passed it. */
  readonly hand?: { up: boolean; locked: boolean } | null;
  /** Greyed out: not a valid pick right now. */
  readonly disabled?: boolean;
}

/** Where chair `i` of `n` sits: the first at the top, then clockwise. */
function seatPoint(i: number, n: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
  return { x: CENTER + RADIUS * Math.cos(angle), y: CENTER + RADIUS * Math.sin(angle) };
}

const TONE_RING: Record<NonNullable<SeatTone>, string> = {
  awake: "ring-4 ring-amber-300/80 shadow-glow-amber",
  nominee: "ring-4 ring-rose-400/80",
  nominator: "ring-2 ring-sky-300/70",
  selected: "ring-4 ring-accent-400",
  picked: "ring-4 ring-emerald-400/80",
};

function Token({ s, onClick }: { s: SquareSeat; onClick?: (() => void) | undefined }) {
  const body = (
    <>
      <span
        className={cn(
          "relative flex aspect-square w-full items-center justify-center rounded-full border-2 bg-surface-900/90 transition",
          s.alive ? "border-line-strong" : "border-line grayscale",
          s.tone ? TONE_RING[s.tone] : null,
          s.disabled && "opacity-40",
        )}
      >
        {s.character ? (
          <CharacterIcon character={s.character} size="lg" decorative className="h-4/5 w-4/5" />
        ) : (
          <span className="text-2xl font-bold text-fg-muted">
            {s.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        {!s.alive && (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center rounded-full bg-surface-950/60 text-3xl"
          >
            ☠
          </span>
        )}
        {!s.alive && s.ghostVote && (
          <span
            title="Has a ghost vote"
            className="absolute -top-1 -right-1 rounded-full border border-line-strong bg-surface-800 px-1 text-xs text-fg-primary"
          >
            👻
          </span>
        )}
        {s.hand?.up && (
          <span
            title={s.hand.locked ? "Voted" : "Hand raised"}
            className={cn(
              "absolute -top-1 -left-1 rounded-full bg-amber-400 px-1 text-base text-surface-950",
              s.hand.locked && "ring-2 ring-fg-strong/60",
            )}
          >
            ✋
          </span>
        )}
        <span
          aria-hidden
          className={cn(
            "absolute right-1 bottom-1 h-3 w-3 rounded-full border border-surface-900",
            s.connected ? "bg-emerald-400" : "bg-fg-disabled",
          )}
        />
      </span>
      <span className="mt-1 block max-w-full truncate text-center text-sm font-semibold text-fg-strong">
        {s.name}
        {s.left ? " (gone)" : ""}
      </span>
      {s.notes?.map((n) => (
        <span key={n} className="block max-w-full truncate text-center text-xs text-fg-muted">
          {n}
        </span>
      ))}
    </>
  );
  const label = `${s.name}${s.alive ? "" : ", dead"}${s.connected ? "" : ", away"}`;
  return onClick && !s.disabled ? (
    // biome-ignore lint/correctness/noRestrictedElements: a seat token on the board is a game piece
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex w-full flex-col items-center rounded-ui-md focus-visible:outline-2 focus-visible:outline-accent-400"
    >
      {body}
    </button>
  ) : (
    <figure aria-label={label} className="m-0 flex w-full flex-col items-center">
      {body}
    </figure>
  );
}

export function TownSquare({
  seats,
  center,
  onSeatClick,
  clockAt,
  night = false,
  ariaLabel = "Town square",
}: {
  seats: readonly SquareSeat[];
  /** What sits in the middle of the circle (the phase, the vote, a prompt). */
  center?: ReactNode;
  onSeatClick?: (seat: number) => void;
  /** The vote's clock hand points at this chair index. */
  clockAt?: number | null;
  /** The town sleeps: the square goes dark. */
  night?: boolean;
  ariaLabel?: string;
}) {
  const n = seats.length;
  const hand = clockAt !== null && clockAt !== undefined && n > 0 ? seatPoint(clockAt, n) : null;
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <BoardSurface
        viewBox={{ x: 0, y: 0, width: SIZE, height: SIZE }}
        aria-label={ariaLabel}
        className="aspect-square h-full max-h-full w-full max-w-full"
        overlays={
          <>
            {seats.map((s, i) => (
              <BoardOverlay key={s.seat} at={seatPoint(i, n)} width={TOKEN}>
                <Token s={s} onClick={onSeatClick ? () => onSeatClick(s.seat) : undefined} />
              </BoardOverlay>
            ))}
            {center && (
              <BoardOverlay at={{ x: CENTER, y: CENTER }} width={440}>
                <div className="flex flex-col items-center gap-2 text-center">{center}</div>
              </BoardOverlay>
            )}
          </>
        }
      >
        <BoardLayer name="square">
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS + TOKEN / 2}
            fill="currentColor"
            className={cn(
              "transition-[fill-opacity] duration-1000",
              night ? "text-purple-950" : "text-amber-200",
            )}
            fillOpacity={night ? 0.4 : 0.03}
          />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.12}
            strokeWidth={3}
            className="text-fg-strong"
          />
          {hand && (
            <line
              x1={CENTER}
              y1={CENTER}
              x2={CENTER + (hand.x - CENTER) * 0.72}
              y2={CENTER + (hand.y - CENTER) * 0.72}
              stroke="currentColor"
              strokeWidth={10}
              strokeLinecap="round"
              className="text-amber-300 transition-all duration-300"
            />
          )}
        </BoardLayer>
      </BoardSurface>
    </div>
  );
}
