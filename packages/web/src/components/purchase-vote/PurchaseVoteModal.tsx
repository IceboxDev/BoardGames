// The purchase-vote voting screen — a deliberate, self-paced surface.
//
// Picks are LOCAL until the player hits Submit: browse the carousel as long
// as you like, toggle up to 3 games, then one save replaces your whole vote
// set on the server and flips to a "votes are in" confirmation showing your
// picks and the participation progress. Nothing here auto-saves and nothing
// closes on its own — this modal is opened from the greeting cards or the
// banner and only the player dismisses it. (v1 mounted the voting UI AS the
// greeting, so casting a vote invalidated the greeting and unmounted the
// screen mid-session — the bug this rewrite removes.)
//
// Per-game tallies stay hidden while the vote is open (anti-bandwagon);
// the confirmation shows only how many players have voted.

import { VOTES_PER_PLAYER } from "@boardgames/core/protocol";
import type { GameDefinition } from "../../games/types";
import { cn } from "../../lib/cn";
import { resolveGame } from "../../lib/games-by-slug";
import { CheckIcon, PlusIcon } from "../icons";
import GameCarousel3D from "../offline/GameCarousel3D";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { ErrorAlert } from "../ui/ErrorAlert";
import { Modal, ModalFooter } from "../ui/Modal";
import {
  type PurchaseVotePaneProps,
  usePurchaseVoteSession,
  VOTE_TITLE_CLASS,
  voteHeader,
} from "./vote-session";

export function PurchaseVoteModalView(props: PurchaseVotePaneProps) {
  const header = voteHeader(props);
  return (
    <Modal
      onClose={props.onClose}
      size="full"
      density="compact"
      eyebrow={header.eyebrow}
      eyebrowClassName="text-accent-300"
      title={header.title}
      titleClassName={VOTE_TITLE_CLASS}
      subheader={
        // Same reasoning: the explainer adds nothing a phone voter needs
        // (the footer already counts picks), so it's desktop-only.
        <p className="hidden text-xs text-fg-secondary sm:block">{header.subheader}</p>
      }
    >
      <PurchaseVotePane {...props} />
    </Modal>
  );
}

/** Everything inside the voting dialog: the carousel and its footer, or the
 * saved confirmation. */
export function PurchaseVotePane({
  candidates,
  selected,
  savedVotes,
  voterCount,
  requiredVoters,
  view,
  pollClosed,
  saving,
  error,
  onToggle,
  onSubmit,
  onClose,
  onBack,
}: PurchaseVotePaneProps) {
  const votesLeft = VOTES_PER_PLAYER - selected.length;
  const dirty =
    selected.length !== savedVotes.length || selected.some((s) => !savedVotes.includes(s));

  return (
    <>
      {error && <ErrorAlert message={error} className="shrink-0 text-center" />}

      {view === "saved" ? (
        <SavedScreen
          selected={selected}
          voterCount={voterCount}
          requiredVoters={requiredVoters}
          pollClosed={pollClosed}
          onClose={onClose}
        />
      ) : (
        <>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <GameCarousel3D
              games={candidates}
              minPlayers={0}
              maxPlayers={0}
              date=""
              reactions={{}}
              renderThumbOverlay={(game, isCenter, compact) => {
                const picked = selected.includes(game.slug);
                return (
                  <Chip
                    pressed={picked}
                    tone="emerald"
                    shape="pill"
                    size={compact ? "sm" : "md"}
                    icon={
                      picked ? (
                        <CheckIcon className="h-3.5 w-3.5" />
                      ) : (
                        <PlusIcon className="h-3.5 w-3.5" />
                      )
                    }
                    disabled={!isCenter || (!picked && votesLeft === 0)}
                    title={
                      !picked && votesLeft === 0
                        ? `All ${VOTES_PER_PLAYER} picks are placed — remove one first`
                        : undefined
                    }
                    onClick={() => onToggle(game.slug)}
                    className="shadow-lg shadow-black/40"
                  >
                    {picked ? "Picked" : "Pick"}
                  </Chip>
                );
              }}
            />
          </div>

          {/* Single row always — the pick tokens truncate before this wraps,
            and Cancel is redundant with the header X on phones. */}
          <ModalFooter
            start={
              <div className="flex min-w-0 items-center gap-2">
                {Array.from({ length: VOTES_PER_PLAYER }, (_, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length token row
                    key={i}
                    aria-hidden="true"
                    className={cn(
                      "h-2.5 w-2.5 rounded-full transition",
                      i < selected.length ? "bg-emerald-400" : "border border-fg-strong/25",
                    )}
                  />
                ))}
                <span className="truncate text-2xs text-fg-muted">
                  {selected.length === 0
                    ? `${VOTES_PER_PLAYER} picks to place`
                    : votesLeft === 0
                      ? "All picks placed — submit to save them"
                      : `${votesLeft} pick${votesLeft === 1 ? "" : "s"} left`}
                </span>
              </div>
            }
          >
            {onBack ? (
              <Button variant="ghost" size="sm" onClick={onBack}>
                Back
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={onClose} className="hidden sm:inline-flex">
                Cancel
              </Button>
            )}
            {/* Gate only on "changed": submitting an EMPTY set is a valid
                action (withdrawing your votes) — the empty-selection case
                that must stay disabled is the pristine no-votes-yet one,
                which `dirty` already covers. */}
            <Button size="sm" disabled={!dirty || saving} onClick={onSubmit}>
              {saving
                ? "Saving…"
                : savedVotes.length > 0
                  ? selected.length === 0
                    ? "Withdraw votes"
                    : "Update votes"
                  : "Submit votes"}
            </Button>
          </ModalFooter>
        </>
      )}
    </>
  );
}

function SavedScreen({
  selected,
  voterCount,
  requiredVoters,
  pollClosed,
  onClose,
}: {
  selected: string[];
  voterCount: number;
  requiredVoters: number;
  pollClosed: boolean;
  onClose: () => void;
}) {
  const picks = selected
    .map((slug) => resolveGame(slug))
    .filter((g): g is GameDefinition => g !== undefined);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
        <CheckIcon className="h-7 w-7 text-emerald-300" />
      </span>
      <div className="max-w-md">
        <h3 className="text-lg font-bold text-fg-strong">
          {picks.length === 0 ? "Your votes are withdrawn" : "Your votes are in"}
        </h3>
        <p className="mt-1 text-xs text-fg-secondary">
          {pollClosed
            ? "Yours was the last vote needed — the vote is closed and the winner is on the way!"
            : picks.length === 0
              ? `${voterCount} of ${requiredVoters} players have voted. Come back and spend your 3 votes any time before the vote closes.`
              : `${voterCount} of ${requiredVoters} players have voted. You can change your picks any time until the vote closes; the winner is revealed to everyone the moment it does.`}
        </p>
      </div>
      <div className="flex flex-wrap items-start justify-center gap-3">
        {picks.map((g) => (
          <div key={g.slug} className="w-28">
            <img
              src={g.thumbnail}
              alt=""
              className="aspect-video w-full rounded-card-lg border border-line object-cover"
            />
            <p className="mt-1.5 truncate text-2xs font-semibold text-fg-secondary">{g.title}</p>
          </div>
        ))}
      </div>
      <Button size="sm" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}

/** The standalone voting dialog (the banner and the reminder card open it). */
export function PurchaseVoteModal({ onClose, via }: { onClose: () => void; via?: string }) {
  const session = usePurchaseVoteSession({ onClose, via });
  return session ? <PurchaseVoteModalView {...session} /> : null;
}
