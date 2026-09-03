// The two greeting CARDS for the purchase vote — small GreetingShell
// takeovers in the same celebratory frame as the skill-intro launch popup.
// They explain what's happening and hand the player to the voting modal;
// they never contain the voting UI themselves.
//
//   Announce — one-time "game purchase voting is live" launch card with a
//              strip of contenders. Acked on any dismissal.
//   Reminder — returns every app open while the player still has votes to
//              spend. "Later" only hides it for the current visit.

import type {
  PurchaseVoteAnnounceGreeting,
  PurchaseVoteReminderGreeting,
} from "@boardgames/core/protocol";
import type { GameDefinition } from "../../games/types";
import { resolveGame } from "../../lib/games-by-slug";
import { MegaphoneIcon } from "../icons";
import { GreetingShell } from "../profile/skill/GreetingShell";

const emblem = (
  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/20">
    <MegaphoneIcon className="h-5 w-5 text-[var(--accent)]" />
  </span>
);

export function PurchaseVoteAnnounceModal({
  greeting,
  onDismiss,
  onCta,
}: {
  greeting: PurchaseVoteAnnounceGreeting;
  onDismiss: () => void;
  onCta: () => void;
}) {
  const contenders = greeting.candidates
    .map((slug) => resolveGame(slug))
    .filter((g): g is GameDefinition => g !== undefined);
  const shown = contenders.slice(0, 6);
  const extra = contenders.length - shown.length;

  return (
    <GreetingShell
      accentHex={null}
      eyebrow="New feature"
      title="Game purchase voting is live"
      heroEyebrow="The group's next game"
      heroTitle="Your 3 votes decide it"
      heroDetail={`${contenders.length} contenders are up. Every player picks their top 3 — when ${greeting.requiredVoters} players have voted, the winner joins the shelf.`}
      emblem={emblem}
      ctaLabel="Vote now"
      onCta={onCta}
      onDismiss={onDismiss}
    >
      <div className="flex items-center justify-center gap-2">
        {shown.map((g) => (
          <img
            key={g.slug}
            src={g.thumbnail}
            alt={g.title}
            title={g.title}
            className="h-10 w-16 rounded-md border border-white/10 object-cover"
          />
        ))}
        {extra > 0 && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-800 text-2xs font-semibold text-fg-secondary">
            +{extra}
          </span>
        )}
      </div>
    </GreetingShell>
  );
}

export function PurchaseVoteReminderModal({
  greeting,
  onDismiss,
  onCta,
}: {
  greeting: PurchaseVoteReminderGreeting;
  onDismiss: () => void;
  onCta: () => void;
}) {
  const { votesLeft, voterCount, requiredVoters } = greeting;
  return (
    <GreetingShell
      accentHex={null}
      eyebrow="Purchase vote"
      title="Votes still on the table"
      heroEyebrow="Reminder"
      heroTitle={
        votesLeft === 3
          ? "Your 3 votes are waiting"
          : `${votesLeft} vote${votesLeft === 1 ? "" : "s"} left to spend`
      }
      heroDetail={`${voterCount} of ${requiredVoters} players have voted — the winner is bought when everyone's in.`}
      emblem={emblem}
      ctaLabel={votesLeft === 3 ? "Vote now" : "Spend them"}
      onCta={onCta}
      onDismiss={onDismiss}
    >
      <p className="text-center text-2xs text-fg-muted">
        Your picks aren't final until the vote closes — you can change them any time.
      </p>
    </GreetingShell>
  );
}
