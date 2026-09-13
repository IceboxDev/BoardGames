import type { Clan } from "@boardgames/core/games/senso-battle-for-japan/types";
import { CLAN_KANJI, CLAN_LABELS } from "@boardgames/core/games/senso-battle-for-japan/types";
import { cn } from "../../../../lib/cn";
import { TABLE_PLATE } from "../../colors";
import AdvantageStrip from "../AdvantageStrip";
import SensoCard from "../SensoCard";
import { rectAround, type TableLayout } from "./table-geometry";

interface Props {
  layout: TableLayout;
  round: number;
  trump: Clan;
  advantageRow: Clan[];
  activeIndex: number;
  /** The one line that says what is happening: who leads, what was led, who won. */
  status: string;
}

/**
 * The middle of the cloth: the round's trump card face up with its glow,
 * the four advantage cards laid in their row beneath it, and the single
 * live status line every trick state speaks through.
 */
export default function TableCentre({
  layout,
  round,
  trump,
  advantageRow,
  activeIndex,
  status,
}: Props) {
  const rect = rectAround(layout.centre, layout.centreBlock);
  return (
    <div
      className="absolute z-lift flex flex-col items-center justify-center gap-2 text-center"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, color: TABLE_PLATE }}
    >
      <span className={cn("whitespace-nowrap opacity-80", layout.text.label)}>
        Round {round}/8 ·{" "}
        {layout.trumpCardInCentre
          ? `Trump ${CLAN_KANJI[trump]} ${CLAN_LABELS[trump]}`
          : CLAN_KANJI[trump]}
      </span>
      <div className="flex items-center gap-4">
        {layout.trumpCardInCentre && (
          <div style={{ width: layout.trumpCard.w }}>
            <SensoCard card={`${trump}-14`} size="hand" clanOnly glowing />
          </div>
        )}
        <AdvantageStrip
          row={advantageRow}
          active={activeIndex}
          round={round}
          variant="row"
          cardWidth={layout.advantageCardWidth}
        />
      </div>
      <p
        aria-live="polite"
        className={cn("font-semibold", layout.text.status)}
        style={{ minHeight: "1.4em" }}
      >
        {status}
      </p>
    </div>
  );
}
