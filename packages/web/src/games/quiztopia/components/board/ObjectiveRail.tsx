import { CARDS_PER_GAME, type QuiztopiaPlayerView } from "@boardgames/core/games/quiztopia/types";
import { Badge, MicroLabel, StatTile } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { deckLabel } from "../../logic/copy";
import { type SeatNames, seatName } from "../../logic/seats";

// The left rail: the two numbers that decide the game, the card holder, the
// table settings and who sits where. On phones the rail lives in a sheet,
// so `ObjectiveStrip` repeats the numbers as a badge row above the board.

type Props = {
  view: QuiztopiaPlayerView;
  seatNames: SeatNames;
};

export function CardStackMeter({ remaining }: { remaining: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-label="Question cards left"
        aria-valuemin={0}
        aria-valuemax={CARDS_PER_GAME}
        aria-valuenow={remaining}
        className="grid grid-cols-12 gap-0.5"
      >
        {Array.from({ length: CARDS_PER_GAME }, (_, i) => (
          <span
            key={`seg-${i.toString()}`}
            className={cn(
              "h-1.5 rounded-full transition-colors duration-500 motion-reduce:transition-none",
              i < remaining ? "bg-amber-400" : "bg-surface-800",
            )}
          />
        ))}
      </div>
      <span className="text-xs tabular-nums text-fg-secondary">
        <span className="font-semibold text-fg-strong">{remaining}</span>{" "}
        {remaining === 1 ? "card" : "cards"} left
      </span>
    </div>
  );
}

function TableBadges({ view }: { view: QuiztopiaPlayerView }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge tone="amber" size="xs">
        {view.difficultyLabel}
      </Badge>
      <Badge tone={view.expert ? "purple" : "neutral"} size="xs">
        {view.expert ? "Expert" : "Standard"}
      </Badge>
      <Badge tone="neutral" size="xs">
        {deckLabel(view.deck)}
      </Badge>
      {view.bakery && (
        <Badge tone="emerald" size="xs" ring title="The win is banked — now going for all 12">
          Bakery run
        </Badge>
      )}
    </div>
  );
}

function SeatOrder({ view, seatNames }: Props) {
  const barred = new Set(view.turn.plenumBarred);
  return (
    <ol className="flex flex-col gap-1" aria-label="Seat order">
      {view.seats.map((seat, i) => {
        const you = seat === view.you;
        const answering = seat === view.activeSeat;
        const reading = seat === view.readerSeat;
        return (
          <li
            key={`seat-${seat.toString()}`}
            className={cn(
              "flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-ui-md px-2 py-1 text-sm",
              answering && "bg-fill-soft",
            )}
          >
            <MicroLabel className="w-4 shrink-0 tabular-nums">{i + 1}</MicroLabel>
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                you ? "font-semibold text-fg-strong" : "text-fg-primary",
              )}
            >
              {seatName(seatNames, seat)}
            </span>
            {answering && (
              <Badge tone="cyan" size="xs">
                answering
              </Badge>
            )}
            {reading && (
              <Badge tone="purple" size="xs">
                reading
              </Badge>
            )}
            {view.turn.peekSeat === seat && (
              <Badge tone="purple" size="xs" ring title="Peeked via Datenleak">
                peeked
              </Badge>
            )}
            {view.turn.plenum && barred.has(seat) && (
              <Badge tone="neutral" size="xs">
                sits out
              </Badge>
            )}
            {you && (
              <Badge tone="accent" size="xs">
                you
              </Badge>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function ObjectiveRail({ view, seatNames }: Props) {
  const lostMax = view.lossAt - 1;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          variant="plain"
          padding="none"
          size="xl"
          label="Won"
          tone={view.won >= view.required ? "emerald" : "neutral"}
          value={
            <>
              {view.won}{" "}
              <span className="text-sm font-medium text-fg-muted">/ {view.required}</span>
            </>
          }
          sub="to win"
        />
        <StatTile
          variant="plain"
          padding="none"
          size="xl"
          label="Lost"
          tone={view.lost >= lostMax ? "rose" : "neutral"}
          value={
            <>
              {view.lost} <span className="text-sm font-medium text-fg-muted">/ {lostMax}</span>
            </>
          }
          sub="at most"
        />
      </div>

      <CardStackMeter remaining={view.deckRemaining} />

      <TableBadges view={view} />

      <div className="flex flex-col gap-1.5">
        <MicroLabel className="font-semibold">Table</MicroLabel>
        <SeatOrder view={view} seatNames={seatNames} />
        {view.playerCount > 1 ? (
          <span className="text-2xs text-fg-muted">
            Play passes left · the seat to the right reads
          </span>
        ) : (
          <span className="text-2xs text-fg-muted">Solo — you read, answer and judge</span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <MicroLabel className="font-semibold">Help in need</MicroLabel>
        <span className="text-xs tabular-nums text-fg-secondary">
          {view.help.faceUp.length} face-up · {view.help.hidden} face-down ·{" "}
          {view.help.faceUp.filter((c) => c.used).length} used
        </span>
      </div>
    </div>
  );
}

/** Phone header: the rail's numbers as one badge row above the board. */
export function ObjectiveStrip({
  view,
  className,
}: {
  view: QuiztopiaPlayerView;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Badge tone={view.won >= view.required ? "emerald" : "neutral"} size="sm">
        Won {view.won} / {view.required}
      </Badge>
      <Badge tone={view.lost >= view.lossAt - 1 ? "rose" : "neutral"} size="sm">
        Lost {view.lost} / {view.lossAt - 1}
      </Badge>
      <Badge tone="amber" size="sm">
        {view.deckRemaining} cards
      </Badge>
      <Badge tone="neutral" size="sm">
        {view.difficultyLabel}
        {view.expert ? " · Expert" : ""}
      </Badge>
      {view.bakery && (
        <Badge tone="emerald" size="sm" ring>
          Bakery run
        </Badge>
      )}
    </div>
  );
}
