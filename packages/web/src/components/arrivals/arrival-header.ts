import { DEFAULT_ACCENT } from "../../lib/accent.ts";
import { arrivalEyebrow, arrivalSubheader, arrivalTitle } from "./arrival-copy.ts";
import type { ArrivalCard } from "./arrival-view-model.ts";

/** The takeover's header, so a host that frames the shelf in its own Modal
 * (the two-page purchase takeover) says exactly what this one says. */
export function arrivalHeader(cards: readonly ArrivalCard[]) {
  return {
    eyebrow: arrivalEyebrow(cards.length),
    title: arrivalTitle(cards),
    subheader: arrivalSubheader(cards),
    accent: cards[0]?.accentHex ?? DEFAULT_ACCENT,
  };
}

export const ARRIVAL_TITLE_CLASS =
  "gradient-text text-lg font-black tracking-tight xs2:text-xl sm:text-3xl";
