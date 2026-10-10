import { ONBOARDING_CARDS } from "@boardgames/core/protocol";
import { AnimatePresence, motion, type PanInfo, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { cn } from "../../lib/cn";
import { CheckIcon } from "../icons";
import { Button, Modal, ModalBody, ModalFooter } from "../ui";
import { TOUR_CARDS } from "./cards";

// The welcome tour: nine short cards, one idea each, practised on the real
// calendar cell, RSVP switch and vote buttons. Built for a thumb: big Back /
// Next at the bottom, swipe between cards, dots for where you are; arrow
// keys on a keyboard. Each card's "Try it" ticks when done and makes Next
// glow — it never blocks. Closing early counts as skipped; the result goes
// back with how far the member got.

export type TourOutcome = "finished" | "skipped";

type Props = {
  firstName: string | null;
  /** The tour ended — finished (last card's buttons) or skipped (closed early). */
  onClose: (outcome: TourOutcome, reached: number) => void;
  /** The last card's main button: go mark the first days. */
  onStart: (reached: number) => void;
  /** Open at this card (0-based) — the dev preview's screenshots. */
  startAt?: number;
};

const slide = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 48 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -48 }),
};

const SWIPE_PX = 70;

export function OnboardingDeck({ firstName, onClose, onStart, startAt = 0 }: Props) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(startAt);
  const [dir, setDir] = useState(1);
  const [reached, setReached] = useState(startAt + 1);
  const [tried, setTried] = useState<ReadonlySet<string>>(() => new Set());
  const card = TOUR_CARDS[index] ?? TOUR_CARDS[0];
  const last = index === TOUR_CARDS.length - 1;
  const done = tried.has(card.id);

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(TOUR_CARDS.length - 1, next));
      if (clamped === index) return;
      setDir(clamped > index ? 1 : -1);
      setIndex(clamped);
      setReached((r) => Math.max(r, clamped + 1));
    },
    [index],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))
      )
        return;
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_PX) go(index + 1);
    else if (info.offset.x > SWIPE_PX) go(index - 1);
  };

  const markTried = useCallback(() => {
    setTried((cur) => (cur.has(card.id) ? cur : new Set([...cur, card.id])));
  }, [card.id]);

  const skip = () => onClose("skipped", reached);
  const { Body } = card;

  return (
    <Modal
      onClose={() => (last ? onClose("finished", reached) : skip())}
      size="lg"
      density="compact"
      eyebrow={`Welcome · ${index + 1} of ${ONBOARDING_CARDS}`}
      title={card.title}
      headerExtra={
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {TOUR_CARDS.map((c, i) => (
            <span
              key={c.id}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index
                  ? "w-5 bg-accent-400"
                  : i < reached
                    ? "w-1.5 bg-fg-strong/50"
                    : "w-1.5 bg-fg-strong/20",
              )}
            />
          ))}
        </div>
      }
    >
      <ModalBody>
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={card.id}
            data-card={card.id}
            custom={dir}
            variants={slide}
            initial={reduced ? false : "enter"}
            animate="center"
            exit={reduced ? undefined : "exit"}
            transition={{ duration: 0.2, ease: "easeOut" }}
            drag={reduced ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={onDragEnd}
            className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-1"
          >
            <Body firstName={firstName} tried={done} markTried={markTried} />
            {card.tryIt && (
              <p
                aria-live="polite"
                className={cn(
                  "flex items-center justify-center gap-2 text-sm font-medium",
                  done ? "text-emerald-300" : "text-accent-300",
                )}
              >
                {done ? (
                  <>
                    <CheckIcon className="h-4 w-4" />
                    Nice — that's it!
                  </>
                ) : (
                  <>👉 Try it: {card.tryIt}</>
                )}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </ModalBody>
      <ModalFooter
        start={
          index === 0 ? (
            <Button variant="ghost" onClick={skip}>
              Skip tour
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => go(index - 1)}>
              Back
            </Button>
          )
        }
      >
        {last ? (
          <>
            <Button variant="secondary" size="lg" onClick={() => onClose("finished", reached)}>
              Done
            </Button>
            <Button variant="primary" size="lg" onClick={() => onStart(reached)}>
              Mark my first days
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            size="lg"
            onClick={() => go(index + 1)}
            className={cn("min-w-32", done && "animate-pulse")}
          >
            {index === 0 ? "Let's go" : "Next"}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}
