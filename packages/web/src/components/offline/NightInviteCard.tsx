// "You're invited" — the greeting card a private night's guest list sees
// once, in the same GreetingShell frame as every other card. It says who is
// hosting, when, how many seats are left and how games get picked, then
// hands the viewer to the night (the RSVP modal via `/offline?date=`) — it
// never contains the RSVP switch itself, so answering can't unmount it.

import type { NightInviteGreeting, SkillPlayerRef } from "@boardgames/core/protocol";
import { formatDayKey } from "../../lib/date-format";
import { GreetingShell } from "../profile/skill/GreetingShell";
import { Avatar } from "../ui/Avatar";
import { ProgressBar } from "../ui/ProgressBar";

export function NightInviteCard({
  greeting,
  host,
  onDismiss,
  onCta,
}: {
  greeting: NightInviteGreeting;
  /** The host, from the greeting response's `players` side-car. */
  host: SkillPlayerRef | undefined;
  onDismiss: () => void;
  onCta: () => void;
}) {
  const hostName = host?.name ?? "The host";
  const { seats } = greeting;
  const left = Math.max(0, seats.total - seats.taken);
  const when = `${formatDayKey(greeting.date, "weekday")}${
    greeting.eventTime ? ` · ${greeting.eventTime}` : ""
  }`;
  const seatLine =
    left > 0
      ? `${left} of ${seats.total} seats ${left === 1 ? "is" : "are"} still free — first to answer, first seated.`
      : `All ${seats.total} seats are taken — answering puts you on the waitlist.`;
  const pickLine =
    greeting.pickMode === "host"
      ? `${hostName} is picking the games.`
      : "Everyone seated votes on the games.";

  return (
    <GreetingShell
      accentHex={null}
      eyebrow="Private night"
      title="You're invited"
      heroEyebrow={`${hostName} is hosting`}
      heroTitle={greeting.title ?? "A private game night"}
      heroDetail={`${when}. ${seatLine} ${pickLine}`}
      emblem={<Avatar name={hostName} image={host?.image ?? null} size="lg" />}
      ctaLabel="See the night"
      onCta={onCta}
      onDismiss={onDismiss}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-2xs text-fg-secondary">
          <span>Seats</span>
          <span className="font-semibold tabular-nums text-fg-strong">
            {seats.taken} / {seats.total}
            {seats.waitlisted > 0 && (
              <span className="font-normal text-fg-muted"> · {seats.waitlisted} waiting</span>
            )}
          </span>
        </div>
        <ProgressBar
          value={seats.taken}
          extent={seats.total}
          tone={left === 0 ? "amber" : "accent"}
          label="Seats taken"
          animate={false}
        />
      </div>
    </GreetingShell>
  );
}
