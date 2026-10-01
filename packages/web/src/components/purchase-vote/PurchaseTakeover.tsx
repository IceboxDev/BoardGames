import {
  type GreetingAckAction,
  greetingVia,
  type PurchaseVoteAnnounceGreeting,
  VOTES_PER_PLAYER,
} from "@boardgames/core/protocol";
import { AnimatePresence, motion } from "framer-motion";
import { type CSSProperties, type ReactNode, useState } from "react";
import type { GameDefinition } from "../../games/types";
import { cn } from "../../lib/cn";
import { resolveGame } from "../../lib/games-by-slug";
import { ArrivalShelf } from "../arrivals/ArrivalTakeoverView";
import { ctaLabel } from "../arrivals/arrival-copy";
import { ARRIVAL_TITLE_CLASS, arrivalHeader } from "../arrivals/arrival-header";
import { useArrivalReducedMotion } from "../arrivals/arrival-motion";
import type { ArrivalCard, ArrivalTotals } from "../arrivals/arrival-view-model";
import { ArrowRightIcon } from "../icons";
import { Button } from "../ui/Button";
import { Modal, ModalFooter } from "../ui/Modal";
import { PurchaseVotePane } from "./PurchaseVoteModal";
import { VoteIntro } from "./VoteIntro";
import { slateAccent, voteShortTitle, voteTagline } from "./vote-copy";
import {
  type PurchaseVotePaneProps,
  usePurchaseVoteSession,
  VOTE_TITLE_CLASS,
  voteHeader,
} from "./vote-session";

// The purchase takeover — ONE dialog for the whole purchase cycle.
//
//   1. arrival — the games the last vote bought, on the shelf (when the
//      viewer hasn't seen them yet);
//   2. vote    — the new vote, introduced: its theme, its numbers, its slate;
//   3. ballot  — the voting carousel itself, then the "votes are in" screen.
//
// The pages slide inside one Modal, so the panel never closes and reopens
// between "here's what you chose" and "now choose again". Each page takes
// its own accent: the first arrived game's, then the slate's blended one.
// Acks are the host's: `onClose` reports how far the viewer got, so both
// greetings retire together however the dialog ends.

type Step = "arrival" | "vote" | "ballot";

export type PurchaseTakeoverOutcome = {
  /** "cta" once the viewer moved past the shelf or opened the collection. */
  arrival: GreetingAckAction;
  /** "cta" once the viewer opened the ballot. */
  vote: GreetingAckAction;
};

export type PurchaseTakeoverProps = {
  /** The shelf page; absent when the vote is announced on its own. */
  arrival?: { cards: ArrivalCard[]; totals: ArrivalTotals };
  vote: PurchaseVoteAnnounceGreeting;
  viewerId: string | null;
  onClose: (outcome: PurchaseTakeoverOutcome) => void;
  /** The shelf's own CTA (a collection): the host closes, then navigates. */
  onArrivalCta: () => void;
  /** A static ballot (dev preview) instead of the live voting session. */
  ballot?: PurchaseVotePaneProps;
  /** Start on this page (dev preview). */
  initialStep?: Step;
};

const slide = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -40 }),
};

export function PurchaseTakeover({
  arrival,
  vote,
  viewerId,
  onClose,
  onArrivalCta,
  ballot,
  initialStep,
}: PurchaseTakeoverProps) {
  const reduced = useArrivalReducedMotion();
  const [step, setStep] = useState<Step>(initialStep ?? (arrival ? "arrival" : "vote"));
  const [dir, setDir] = useState(1);
  const [reached, setReached] = useState<Set<Step>>(() => new Set([step]));
  const go = (next: Step) => {
    const order: Step[] = ["arrival", "vote", "ballot"];
    setDir(order.indexOf(next) >= order.indexOf(step) ? 1 : -1);
    setReached((r) => new Set(r).add(next));
    setStep(next);
  };
  const outcome = (): PurchaseTakeoverOutcome => ({
    arrival: arrival && (reached.has("vote") || reached.has("ballot")) ? "cta" : "later",
    vote: reached.has("ballot") ? "cta" : "later",
  });
  const close = () => onClose(outcome());

  const contenders = vote.candidates
    .map((slug) => resolveGame(slug))
    .filter((g): g is GameDefinition => g !== undefined)
    .sort((a, b) => a.title.localeCompare(b.title));
  const voteAccent = slateAccent(contenders);
  const shortTitle = voteShortTitle(vote.title);

  let header: { eyebrow: string; title: string; subheader: string; accent: string; cls: string };
  let page: ReactNode;
  if (step === "arrival" && arrival) {
    const h = arrivalHeader(arrival.cards);
    header = { ...h, cls: ARRIVAL_TITLE_CLASS };
    page = (
      <>
        <ArrivalShelf cards={arrival.cards} totals={arrival.totals} viewerId={viewerId} />
        <ModalFooter
          start={
            <Button
              variant="ghost"
              size="sm"
              onClick={onArrivalCta}
              className="hidden sm:inline-flex"
            >
              {ctaLabel(arrival.cards, viewerId)}
            </Button>
          }
        >
          <Button variant="ghost" size="sm" onClick={close}>
            Later
          </Button>
          <Button size="sm" onClick={() => go("vote")}>
            <span className="sm:hidden">Next: {shortTitle}</span>
            <span className="hidden sm:inline">Next up: {shortTitle}</span>
            <ArrowRightIcon className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </ModalFooter>
      </>
    );
  } else if (step === "ballot") {
    const h = voteHeader({
      view: ballot?.view ?? "picking",
      voterCount: vote.voterCount,
      requiredVoters: vote.requiredVoters,
      title: vote.title,
    });
    header = {
      ...h,
      eyebrow: voteTagline(vote.title) ?? "Purchase vote",
      title: shortTitle,
      accent: voteAccent,
      cls: VOTE_TITLE_CLASS,
    };
    page = ballot ? (
      <PurchaseVotePane {...ballot} onClose={close} onBack={() => go("vote")} />
    ) : (
      <LiveBallot onClose={close} onBack={() => go("vote")} />
    );
  } else {
    header = {
      eyebrow: arrival ? "Next up" : "Purchase vote",
      title: shortTitle,
      subheader: `${vote.voterCount} of ${vote.requiredVoters} players have voted so far.`,
      accent: voteAccent,
      cls: ARRIVAL_TITLE_CLASS,
    };
    page = (
      <>
        <VoteIntro
          title={vote.title}
          blurb={vote.blurb}
          contenders={contenders}
          voterCount={vote.voterCount}
          requiredVoters={vote.requiredVoters}
          reduced={reduced}
        />
        <ModalFooter
          start={
            arrival ? (
              <Button variant="ghost" size="sm" onClick={() => go("arrival")}>
                Back
              </Button>
            ) : undefined
          }
        >
          <Button variant="ghost" size="sm" onClick={close} className="hidden sm:inline-flex">
            Later
          </Button>
          <Button size="sm" onClick={() => go("ballot")}>
            Cast my {VOTES_PER_PLAYER} votes
            <ArrowRightIcon className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </ModalFooter>
      </>
    );
  }

  const pages: Step[] = arrival ? ["arrival", "vote"] : [];
  return (
    <Modal
      onClose={close}
      size="full"
      density="compact"
      eyebrow={header.eyebrow}
      eyebrowClassName="text-[var(--accent)]"
      title={header.title}
      titleClassName={header.cls}
      subheader={<p className="hidden text-xs text-fg-secondary sm:block">{header.subheader}</p>}
      headerExtra={
        pages.length > 0 && step !== "ballot" ? (
          <div className="flex items-center gap-1.5">
            <span className="sr-only">
              Page {pages.indexOf(step) + 1} of {pages.length}
            </span>
            {pages.map((p) => (
              <span
                key={p}
                aria-hidden="true"
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  p === step ? "w-5 bg-[var(--accent)]" : "w-1.5 bg-fg-strong/25",
                )}
              />
            ))}
          </div>
        ) : undefined
      }
      panelClassName="border-[var(--accent)]/30 transition-colors duration-500"
      style={{ "--accent": header.accent } as CSSProperties}
    >
      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div
          key={step}
          custom={dir}
          variants={slide}
          initial={reduced ? false : "enter"}
          animate="center"
          exit={reduced ? undefined : "exit"}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          {page}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}

/** The ballot on the live poll — mounted only once the viewer reaches it. */
function LiveBallot({ onClose, onBack }: { onClose: () => void; onBack: () => void }) {
  const session = usePurchaseVoteSession({ onClose, via: greetingVia("purchase-vote-announce") });
  if (!session) return null;
  return <PurchaseVotePane {...session} onBack={onBack} />;
}
