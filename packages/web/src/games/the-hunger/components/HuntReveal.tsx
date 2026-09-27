import type { HungerPlayerView, LogEntry } from "@boardgames/core/games/the-hunger/types";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Button, Modal, ModalBody, ModalFooter } from "../../../components/ui";
import { cardName } from "../logic/labels";
import CardPreview from "./CardPreview";
import HungerCard from "./HungerCard";

interface Reveal {
  cards: string[];
  vp: number;
  tavern: boolean;
  /** Gregarious Humans that brought a companion along. */
  by: string[];
}

/**
 * What you hunted blind, shown face up: the Tavern's face-down cards, and any
 * companion a Gregarious Human pulled off the top of the Hunt deck. Opens as
 * soon as your hunt lands (never for history already on screen at mount), one
 * card after another, and closes on a click.
 */
export default function HuntReveal({ view }: { view: HungerPlayerView }) {
  const seen = useRef(view.log.length);
  const [reveal, setReveal] = useState<Reveal | null>(null);

  useEffect(() => {
    const fresh = view.log.slice(seen.current);
    seen.current = view.log.length;
    const blind = fresh.filter(
      (e): e is Extract<LogEntry, { t: "hunt" }> =>
        e.t === "hunt" && e.p === view.me && (e.source === "tavern" || e.source === "gregarious"),
    );
    if (blind.length === 0) return;
    setReveal({
      cards: blind.flatMap((e) => e.cards),
      vp: blind.reduce((n, e) => n + e.vp, 0),
      tavern: blind.some((e) => e.source === "tavern"),
      by: blind.flatMap((e) => (e.by ? [e.by] : [])),
    });
  }, [view.log, view.me]);

  if (!reveal) return null;
  const close = () => setReveal(null);
  return (
    <Modal
      onClose={close}
      size="xl"
      eyebrow={reveal.tavern ? "The Tavern" : "Gregarious"}
      title={reveal.tavern ? "What was hiding in the Tavern" : "They brought company"}
      subheader={
        reveal.tavern
          ? `${reveal.cards.length} card${reveal.cards.length === 1 ? "" : "s"}, now yours · +${reveal.vp} VP`
          : `${reveal.by.map(cardName).join(" and ")} brought ${reveal.cards.map(cardName).join(" and ")} along · +${reveal.vp} VP`
      }
    >
      <ModalBody>
        <div className="flex flex-wrap justify-center gap-4 py-2">
          {reveal.cards.map((id, i) => (
            <motion.div
              key={id}
              initial={{ rotateY: 90, opacity: 0, y: 12 }}
              animate={{ rotateY: 0, opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.18, type: "spring", stiffness: 220, damping: 22 }}
              className="w-48"
            >
              <CardPreview card={id}>
                <HungerCard card={id} />
              </CardPreview>
            </motion.div>
          ))}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button onClick={close}>Take them</Button>
      </ModalFooter>
    </Modal>
  );
}
