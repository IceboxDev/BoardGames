import type { CardId, Clan } from "@boardgames/core/games/senso-battle-for-japan/types";
import { AnimatePresence, motion } from "framer-motion";
import { ordinal } from "../../../../lib/match-result-badge";
import { TABLE_SLOT_FILL, TABLE_SLOT_STROKE } from "../../colors";
import { cardSpokenLabel } from "../../logic/cards";
import SensoCard from "../SensoCard";
import { type Point, rectAround, type TableLayout } from "./table-geometry";
import { playedCardVariants, ringVariants } from "./table-motion";

interface Props {
  layout: TableLayout;
  /** Slot centre — where this seat's card always lands. */
  at: Point;
  /** The seat's plate centre — where the card flies in from. */
  from: Point;
  card: CardId | null;
  /** 1-based play order within the trick. */
  order: number | null;
  trump: Clan;
  playedBy: string;
  isWinner: boolean;
  sweeping: boolean;
  winnerPlate: Point | null;
  /** Identity for the mount/unmount animation. */
  cardKey: string | null;
  reduce: boolean;
  /** Hover-and-hold preview, the fan's gesture. */
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
}

/**
 * One seat's spot on the cloth. The chalk outline is always there, so an
 * empty seat still reads as a seat; the played card flies in from the plate,
 * rings emerald when it wins, and sweeps into the winner's plate when the
 * conflict is collected. Play order lives only in the spoken label — the
 * fixed slots already say whose card is whose.
 */
export default function CardSlot({
  layout,
  at,
  from,
  card,
  order,
  trump,
  playedBy,
  isWinner,
  sweeping,
  winnerPlate,
  cardKey,
  reduce,
  onHoverStart,
  onHoverEnd,
}: Props) {
  const rect = rectAround(at, layout.card);
  return (
    <div
      className="absolute z-raised"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-card-xl border-2 border-dashed"
        style={{ borderColor: TABLE_SLOT_STROKE, background: TABLE_SLOT_FILL }}
      />
      <AnimatePresence initial={false} custom={winnerPlate}>
        {card && cardKey && (
          <motion.div
            key={cardKey}
            data-played-card=""
            data-winner={isWinner ? "" : undefined}
            custom={winnerPlate}
            variants={playedCardVariants(from, at, reduce)}
            initial="enter"
            animate={sweeping ? "sweep" : "land"}
            exit="exit"
            className="absolute inset-0"
            onPointerEnter={onHoverStart}
            onPointerLeave={onHoverEnd}
          >
            <SensoCard
              card={card}
              size="play"
              trump={trump}
              className="h-full shadow-lg"
              ariaLabel={`${cardSpokenLabel(card)}, played ${order ? ordinal(order) : ""} by ${playedBy}`}
            />
            {isWinner && (
              <motion.span
                aria-hidden="true"
                variants={ringVariants(reduce)}
                initial="hidden"
                animate="shown"
                className="pointer-events-none absolute inset-0 rounded-card-xl ring-4 ring-emerald-400 shadow-glow-emerald"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
