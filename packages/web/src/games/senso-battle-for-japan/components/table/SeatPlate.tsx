import type { Clan } from "@boardgames/core/games/senso-battle-for-japan/types";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../../../../lib/cn";
import { EMPEROR_GOLD, TABLE_PLATE, TABLE_PLATE_EDGE, TABLE_PLATE_INK } from "../../colors";
import { SeatMon, TrickPips } from "../SeatMon";
import { SensoCardBack } from "../SensoCard";
import { type Point, rectAround, type TableLayout } from "./table-geometry";
import { chipVariants } from "./table-motion";

interface Props {
  layout: TableLayout;
  at: Point;
  clan: Clan | null;
  label: string;
  handCount: number;
  tricksWon: number;
  isMe: boolean;
  isFirstPlayer: boolean;
  isLeader: boolean;
  isActive: boolean;
  isWinner: boolean;
  reduce: boolean;
}

const EMPEROR_INK = "#2b2200";

/**
 * A seat's paper plate outside the rim: who sits here, what they hold, what
 * they have won. Row one is identity (clan mon, name, the gold First Player
 * token); row two is the hand as a fan of card backs and the tricks-won
 * pile with the reward-threshold pips. The "leads" tag hangs off the top
 * edge and pops when it moves to a new seat; the active seat wears the
 * accent ring, the conflict winner the emerald one.
 */
export default function SeatPlate({
  layout,
  at,
  clan,
  label,
  handCount,
  tricksWon,
  isMe,
  isFirstPlayer,
  isLeader,
  isActive,
  isWinner,
  reduce,
}: Props) {
  const rect = rectAround(at, layout.plate);
  const fan = Math.min(handCount, layout.fanMax);
  const pile = Math.min(tricksWon, layout.fanMax >= 5 ? 3 : 2);
  const backStyle = { width: layout.miniBack.w, height: layout.miniBack.h };
  const overlap = Math.round(layout.miniBack.w * 0.6);

  return (
    <div
      data-seat-plate=""
      data-active={isActive ? "" : undefined}
      className={cn(
        // Shadow via a class, never inline: Tailwind's ring is a box-shadow
        // too, and an inline box-shadow would erase it.
        "absolute z-lift flex flex-col justify-between rounded-card-lg border px-3 py-2 shadow-xl transition-shadow",
        isWinner
          ? "ring-4 ring-emerald-400"
          : isActive
            ? "ring-4 ring-accent-500 shadow-glow-accent"
            : "",
      )}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        background: TABLE_PLATE,
        borderColor: TABLE_PLATE_EDGE,
        color: TABLE_PLATE_INK,
      }}
    >
      <AnimatePresence initial={false}>
        {isLeader && (
          <motion.div
            key="leads"
            variants={chipVariants(reduce)}
            initial="hidden"
            animate="shown"
            exit="hidden"
            className="absolute right-3 top-0 -translate-y-1/2"
          >
            <span
              className={cn(
                "inline-block rounded-full bg-amber-400 px-3 py-0.5 uppercase leading-tight tracking-pill text-amber-950 shadow",
                layout.text.chip,
              )}
            >
              leads
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 items-center gap-2">
        <SeatMon clan={clan} size={layout.monogram} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate leading-tight",
            layout.text.name,
            isMe && "font-bold",
          )}
        >
          {label}
        </span>
        {isFirstPlayer && (
          <span
            role="img"
            title="First Player"
            aria-label="First Player"
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full font-bold leading-none",
              layout.text.chip,
            )}
            style={{
              width: layout.monogram * 0.7,
              height: layout.monogram * 0.7,
              background: EMPEROR_GOLD,
              color: EMPEROR_INK,
            }}
          >
            ☆
          </span>
        )}
      </div>

      <div className={cn("flex items-end justify-between gap-3", layout.text.meta)}>
        <div className="flex items-end gap-2" role="img" aria-label={`${handCount} cards in hand`}>
          <div className="flex items-end" aria-hidden="true">
            {Array.from({ length: fan }, (_, i) => (
              <SensoCardBack
                // biome-ignore lint/suspicious/noArrayIndexKey: identical face-down cards
                key={i}
                size="mini"
                className="shrink-0 rounded-card-md"
                style={{ ...backStyle, marginLeft: i === 0 ? 0 : -overlap }}
              />
            ))}
          </div>
          <span className="tabular-nums">{handCount}</span>
        </div>
        <div className="flex items-end gap-2">
          <div className="relative flex items-end" aria-hidden="true">
            {Array.from({ length: pile }, (_, i) => (
              <SensoCardBack
                // biome-ignore lint/suspicious/noArrayIndexKey: identical face-down cards
                key={i}
                size="mini"
                className="shrink-0 rounded-card-md"
                style={{
                  ...backStyle,
                  marginLeft: i === 0 ? 0 : -Math.round(layout.miniBack.w * 0.85),
                  transform: `translateY(${-i * 2}px)`,
                }}
              />
            ))}
            {pile === 0 && (
              <span
                className="rounded-card-md border border-dashed"
                style={{ ...backStyle, borderColor: TABLE_PLATE_EDGE, opacity: 0.5 }}
              />
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={tricksWon}
                variants={chipVariants(reduce)}
                initial="hidden"
                animate="shown"
                className="font-bold tabular-nums leading-none"
                aria-label={`${tricksWon} conflicts won`}
              >
                {tricksWon}
              </motion.span>
            </AnimatePresence>
            {layout.pip > 0 && <TrickPips won={tricksWon} dot={layout.pip} />}
          </div>
        </div>
      </div>
    </div>
  );
}
