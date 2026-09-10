import { motion } from "framer-motion";
import { type CSSProperties, type ReactNode, useCallback, useRef, useState } from "react";
import { DEFAULT_ACCENT } from "../../lib/accent.ts";
import { cn } from "../../lib/cn";
import { ArrowRightIcon, SparkleIcon } from "../icons";
import { Button } from "../ui/Button.tsx";
import { Modal, ModalBody, ModalFooter } from "../ui/Modal.tsx";
import { StatTile } from "../ui/StatTile.tsx";
import { Surface } from "../ui/Surface.tsx";
import { ArrivalPhotoCard } from "./ArrivalPhotoCard.tsx";
import {
  arrivalEyebrow,
  arrivalSubheader,
  arrivalTitle,
  collectionHint,
  ctaLabel,
  thanksSentence,
} from "./arrival-copy.ts";
import { stage, useArrivalReducedMotion } from "./arrival-motion.ts";
import type { ArrivalCard, ArrivalTotals } from "./arrival-view-model.ts";

// "The Shelf" — the takeover that replaces the purchase-vote result reveal.
//
// One to three photo cards stand in a row. On a phone the row is a snap
// rail: each card takes four fifths of the width so the next one peeks in,
// with a dot indicator underneath; from `md` the same DOM lays the cards
// side by side with a gentle outward fan, floating in the tall canvas. Below
// them, one tile thanks the purchasers by name and the voters by count, and
// the footer's hint says whose collection the games are now in.
//
// Pure: data in, callbacks out. `GreetingHost` maps the wire greeting to
// cards and acks on dismiss or CTA; the admin composer renders the same
// view over its draft as a preview. Reduced motion renders every "show"
// value immediately and freezes the orbit.

export type ArrivalTakeoverViewProps = {
  cards: ArrivalCard[];
  totals: ArrivalTotals;
  /** The signed-in viewer, for "you" voice and the CTA destination. */
  viewerId: string | null;
  onDismiss: () => void;
  onCta: () => void;
  /** Admin-only caption slot (preview mode). */
  switcher?: ReactNode;
};

/** Static wrapper transforms — the framer entrance lives on the inner card,
 * so the fan tilt and the rise never fight over `transform`. */
function tilt(index: number, count: number): string {
  if (count === 3) {
    if (index === 0) return "md:-rotate-2 md:translate-y-2";
    if (index === 2) return "md:rotate-2 md:translate-y-2";
    return "";
  }
  if (count === 2)
    return index === 0 ? "md:-rotate-1 md:translate-y-1" : "md:rotate-1 md:translate-y-1";
  return "";
}

export function ArrivalTakeoverView({
  cards,
  totals,
  viewerId,
  onDismiss,
  onCta,
  switcher,
}: ArrivalTakeoverViewProps) {
  const reduced = useArrivalReducedMotion();
  const count = cards.length;
  const accent = cards[0]?.accentHex ?? DEFAULT_ACCENT;
  const thanks = thanksSentence(cards, totals, viewerId);

  // Phone rail position → dot indicator. Measured from the DOM (card width +
  // gap) so the dots stay honest whatever the breakpoint-driven sizes are.
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const onScroll = useCallback(() => {
    const rail = railRef.current;
    const first = rail?.children[0];
    const second = rail?.children[1];
    if (!rail || !(first instanceof HTMLElement)) return;
    const step =
      second instanceof HTMLElement ? second.offsetLeft - first.offsetLeft : first.offsetWidth || 1;
    const next = Math.round(rail.scrollLeft / Math.max(1, step));
    setActive(Math.min(count - 1, Math.max(0, next)));
  }, [count]);

  return (
    <Modal
      onClose={onDismiss}
      size="full"
      density="compact"
      eyebrow={arrivalEyebrow(count)}
      eyebrowClassName="text-[var(--accent)]"
      title={arrivalTitle(cards)}
      titleClassName="gradient-text text-lg font-black tracking-tight xs2:text-xl sm:text-3xl"
      subheader={
        <p className="hidden text-xs text-fg-secondary sm:block">{arrivalSubheader(cards)}</p>
      }
      panelClassName="border-[var(--accent)]/30"
      style={{ "--accent": accent } as CSSProperties}
    >
      <ModalBody gap="md" className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-6 top-10 h-56 w-56 rounded-full bg-[var(--accent)]/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-12 right-6 h-56 w-56 rounded-full bg-[var(--accent)]/10 blur-3xl"
        />
        <SparkleIcon className="pointer-events-none absolute right-3 top-1 h-4 w-4 text-fg-strong/50" />
        <SparkleIcon className="pointer-events-none absolute right-9 top-6 h-2.5 w-2.5 text-fg-strong/30" />

        <motion.div
          initial={reduced ? false : "hidden"}
          animate="show"
          className="relative flex flex-col gap-4 md:my-auto md:gap-6"
        >
          <motion.div
            ref={railRef}
            onScroll={onScroll}
            variants={stage.rail}
            data-testid="arrival-rail"
            className={cn(
              "flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2 pt-1 [scrollbar-width:none]",
              "md:snap-none md:justify-center md:gap-5 md:overflow-visible lg:gap-7",
              count === 1 && "justify-center",
            )}
          >
            {cards.map((card, i) => (
              <div
                key={card.slug}
                className={cn(
                  "shrink-0 snap-center md:min-w-0 md:flex-1",
                  count === 1
                    ? "w-full max-w-sm md:max-w-xs 3xl:max-w-sm"
                    : "w-4/5 md:w-auto md:max-w-xs 3xl:max-w-sm",
                  tilt(i, count),
                )}
              >
                <ArrivalPhotoCard card={card} index={i} count={count} reduced={reduced} />
              </div>
            ))}
          </motion.div>

          {count > 1 && (
            <>
              <div
                aria-hidden="true"
                data-testid="arrival-dots"
                className="flex items-center justify-center gap-1.5 md:hidden"
              >
                {cards.map((card, i) => (
                  <span
                    key={card.slug}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === active ? "w-4 bg-[var(--accent)]" : "w-1.5 bg-fg-strong/25",
                    )}
                  />
                ))}
              </div>
              <p className="sr-only" aria-live="polite">
                Game {active + 1} of {count}
              </p>
            </>
          )}

          <motion.div variants={stage.fadeUp}>
            <Surface
              variant="tile"
              padding="md"
              className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6"
            >
              <p className="flex items-start gap-2 text-sm text-fg-secondary">
                <SparkleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                <span>
                  Thanks to <span className="font-semibold text-fg-strong">{thanks.names}</span>
                  {thanks.rest}{" "}
                  <span className="font-semibold text-fg-strong">
                    {collectionHint(cards, viewerId)}.
                  </span>
                </span>
              </p>
              <div className="flex shrink-0 gap-6">
                <StatTile
                  variant="plain"
                  padding="none"
                  size="lg"
                  label="votes cast"
                  value={totals.votesCast}
                />
                <StatTile
                  variant="plain"
                  padding="none"
                  size="lg"
                  label="voters"
                  value={totals.voterCount}
                />
              </div>
            </Surface>
          </motion.div>

          {switcher}
        </motion.div>
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Later
        </Button>
        <Button size="sm" onClick={onCta}>
          {ctaLabel(cards, viewerId)}
          <ArrowRightIcon className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </ModalFooter>
    </Modal>
  );
}
