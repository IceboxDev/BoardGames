import type { Clan } from "@boardgames/core/games/senso-battle-for-japan/types";
import { motion, useReducedMotion } from "framer-motion";
import { boardSpring } from "../../../components/board";
import { Badge, Eyebrow, MicroLabel } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import SensoCard from "./SensoCard";

interface Props {
  row: Clan[];
  active: number;
  round: number;
  /**
   * `full` — eyebrow, round badge, cards with R1–R4 labels (the rail).
   * `compact` — the same on one line.
   * `row` — the four cards only, laid on the conflict table; `cardWidth`
   *   sizes them in canvas px because the table is a scaled canvas.
   */
  variant?: "full" | "compact" | "row";
  cardWidth?: number;
  /** @deprecated use `variant="compact"` */
  compact?: boolean;
}

/** The four face-up Faction Advantage cards; the active suit is lifted. */
export default function AdvantageStrip({
  row,
  active,
  round,
  variant,
  cardWidth,
  compact = false,
}: Props) {
  const reduce = useReducedMotion();
  const mode = variant ?? (compact ? "compact" : "full");
  const cards = (
    <div className="flex items-end justify-center gap-2">
      {row.map((clan, i) => (
        <motion.div
          key={clan}
          layout
          transition={reduce ? { duration: 0 } : boardSpring}
          className={cn(
            "flex flex-col items-center gap-1",
            i === active ? "-translate-y-1" : "opacity-60",
          )}
          style={cardWidth ? { width: cardWidth } : undefined}
        >
          <SensoCard
            card={`${clan}-14`}
            size="mini"
            className={cardWidth ? "w-full" : undefined}
            clanOnly
            glowing={i === active}
          />
          {mode === "full" && (
            <MicroLabel>{i === active ? "trump" : `R${((round - 1) >> 2) * 4 + i + 1}`}</MicroLabel>
          )}
        </motion.div>
      ))}
    </div>
  );
  if (mode === "row") return cards;
  return (
    <div
      className={cn("flex gap-2", mode === "compact" ? "items-center justify-between" : "flex-col")}
    >
      <div className="flex items-center justify-between gap-2">
        <Eyebrow size="sm" tone="neutral">
          Advantage
        </Eyebrow>
        <Badge tone="amber" size="xs">
          Round {round}/8
        </Badge>
      </div>
      {cards}
    </div>
  );
}
