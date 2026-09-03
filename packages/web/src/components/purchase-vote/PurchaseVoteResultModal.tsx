// The one-time winner reveal after a purchase vote closes.
//
// Reuses the celebratory GreetingShell frame: the winner's cover art floods
// the hero tile, and the proof block is the full final tally — the reveal is
// the first moment players see per-game numbers at all.

import type { PurchaseTallyEntry } from "@boardgames/core/protocol";
import { cn } from "../../lib/cn";
import { resolveGame } from "../../lib/games-by-slug";
import { TrophyIcon } from "../icons";
import { GreetingShell } from "../profile/skill/GreetingShell";

export function PurchaseVoteResultModal({
  winnerSlug,
  tally,
  onDismiss,
  onCta,
}: {
  winnerSlug: string;
  tally: PurchaseTallyEntry[];
  onDismiss: () => void;
  onCta: () => void;
}) {
  const winner = resolveGame(winnerSlug);
  const totalVotes = tally.reduce((s, t) => s + t.votes, 0);
  const winnerVotes = tally.find((t) => t.slug === winnerSlug)?.votes ?? 0;
  const maxVotes = Math.max(1, ...tally.map((t) => t.votes));

  return (
    <GreetingShell
      accentHex={winner?.accentHex}
      eyebrow="Purchase vote"
      title="The group has chosen"
      heroEyebrow="Winner"
      heroTitle={winner?.title ?? winnerSlug}
      heroDetail={`Takes it with ${winnerVotes} of ${totalVotes} votes — welcome to the shelf.`}
      emblem={
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/20">
          <TrophyIcon className="h-5 w-5 text-[var(--accent)]" />
        </span>
      }
      coverSrc={winner?.thumbnail}
      ctaLabel="See the shelf"
      onCta={onCta}
      onDismiss={onDismiss}
    >
      <ul className="flex flex-col gap-1">
        {tally.map((entry, i) => {
          const game = resolveGame(entry.slug);
          const isWinner = entry.slug === winnerSlug;
          return (
            <li
              key={entry.slug}
              className={cn(
                "relative flex items-center gap-2 overflow-hidden rounded-md px-2.5 py-1.5",
                isWinner ? "bg-[var(--accent)]/10" : "bg-surface-900/60",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-0 left-0 rounded-md",
                  isWinner ? "bg-[var(--accent)]/15" : "bg-white/5",
                )}
                style={{ width: `${(entry.votes / maxVotes) * 100}%` }}
              />
              <span className="relative w-5 shrink-0 text-2xs font-semibold text-fg-muted">
                {i + 1}.
              </span>
              <span
                className={cn(
                  "relative min-w-0 flex-1 truncate text-xs",
                  isWinner ? "font-semibold text-white" : "text-fg-secondary",
                )}
              >
                {game?.title ?? entry.slug}
              </span>
              <span className="relative shrink-0 text-xs font-semibold tabular-nums text-fg-secondary">
                {entry.votes}
              </span>
            </li>
          );
        })}
      </ul>
    </GreetingShell>
  );
}
