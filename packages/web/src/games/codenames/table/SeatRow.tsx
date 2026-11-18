import type { SeatPresenceView } from "@boardgames/core/games/codenames/seat-presence";
import type { ReactNode } from "react";
import { BotIcon, UserIcon } from "../../../components/icons";
import { Avatar, ThinkingDots } from "../../../components/ui";
import { TONE_TEXT } from "../../../components/ui/tones";
import { cn } from "../../../lib/cn";
import { tierName } from "./review-model";

// One seat in a table's roster rail (Codenames' teams, Duet's pair): the
// person's picture — or a role circle with a person / bot icon — their name,
// the AI tier playing it, and on the right what the seat is doing now.

/** A roster row's right-hand status: thinking, presence, else `idle`. */
export function SeatStatus({
  thinking,
  presence,
  idle,
}: {
  thinking: boolean;
  presence: SeatPresenceView;
  /** What the row says when nothing is happening (the role, agents on key). */
  idle: ReactNode;
}) {
  if (thinking) return <ThinkingDots title="Thinking…" />;
  if (presence.returning) {
    return (
      <span
        className={cn("shrink-0 text-3xs font-semibold", TONE_TEXT.sky)}
        title="Back — takes the seat from the AI after its move"
      >
        back next move
      </span>
    );
  }
  if (presence.standIn) {
    return (
      <span
        className={cn("shrink-0 text-3xs font-semibold", TONE_TEXT.sky)}
        title="An AI is playing this seat until its player is back"
      >
        AI stand-in
      </span>
    );
  }
  if (presence.awaySince !== null) {
    return (
      <span
        className={cn("shrink-0 text-3xs font-semibold", TONE_TEXT.amber)}
        title="Their connection dropped"
      >
        away
      </span>
    );
  }
  return <span className="shrink-0 text-3xs tabular-nums text-fg-muted">{idle}</span>;
}

export function SeatRow({
  name,
  image,
  ai,
  tier,
  you,
  marker,
  away,
  status,
}: {
  name: string;
  /** A person's profile picture; null shows the role circle. */
  image: string | null;
  ai: boolean;
  /** The AI tier playing the seat from the start (a stand-in's isn't named). */
  tier: string | null;
  you: boolean;
  /**
   * The seat's role colour: fills the role circle and rings the picture
   * (a spymaster's team colour, Duet's green). null = a plain circle.
   */
  marker: { bg: string; ring: string } | null;
  /** The person dropped out (and nobody plays for them): the row dims. */
  away: boolean;
  status: ReactNode;
}) {
  const tierLabel = ai ? tierName(tier) : null;
  return (
    <li className="flex items-center gap-2 text-xs">
      {!ai && image ? (
        // A person's picture; the ring keeps the role circle's code —
        // yours in the accent, a marked role in its colour.
        <Avatar
          name={name}
          image={image}
          size="xs"
          className={cn(
            "h-5 w-5",
            you ? "ring-2 ring-accent-400" : marker && cn("ring-2", marker.ring),
          )}
        />
      ) : (
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
            marker ? cn(marker.bg, "text-cn-cover-ink") : "bg-fill-strong text-fg-secondary",
            you && "ring-2 ring-accent-400",
          )}
          title={you ? "You" : undefined}
        >
          {ai ? <BotIcon className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
        </span>
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          you ? "font-bold text-fg-strong" : "text-fg-secondary",
          away && "opacity-60",
        )}
      >
        {name}
        {you && <span className="font-normal text-fg-muted"> (you)</span>}
        {tierLabel && <span className="font-normal text-fg-muted"> · {tierLabel}</span>}
      </span>
      {status}
    </li>
  );
}
