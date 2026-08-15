// Result badge for a pre-derived `ProfileMatchSummaryItem` — the compact
// counterpart of `matchResultBadge` (which needs the full outcome). Keep the
// two vocabularies identical: same labels, same tones, same placement rules,
// so the profile's recent-matches list and the match-history page never
// disagree about what a result looks like.

import type { ProfileMatchSummaryItem } from "@boardgames/core/protocol";
import type { BadgeTone } from "../components/ui/Badge.tsx";
import { coopMaxScoreForSlug, isPointlessFreeForAll } from "../games/score-config.ts";
import { ordinal } from "./match-result-badge.ts";

export type SummaryBadge = { label: string; tone: BadgeTone };

export function summaryBadge(item: ProfileMatchSummaryItem): SummaryBadge {
  switch (item.result) {
    case "win":
      return { label: "Won", tone: "emerald" };
    case "draw":
      return { label: "Draw", tone: "neutral" };
    case "moderator":
      return { label: "Ran it", tone: "neutral" };
    case "played": {
      // Scored co-op (Just One): show `score / max`, green only when perfect.
      if (item.score !== null) {
        const max = coopMaxScoreForSlug(item.gameSlug);
        const perfect = max !== undefined && item.score >= max;
        const label = max !== undefined ? `${item.score} / ${max}` : String(item.score);
        return { label, tone: perfect ? "emerald" : "amber" };
      }
      return { label: "Ongoing", tone: "sky" };
    }
    case "loss": {
      // Point-less FFAs (Villainous, chess-style duels) have no meaningful
      // placement — flat "Lost", mirroring `matchResultBadge`. Duels (field of
      // 2) also read "Lost": "2nd of 2" dresses up a defeat. Everything placed
      // shows its ordinal — finishing 2nd of 5 is not "Lost" — with rose
      // reserved for actual last place.
      const placeless = item.kind === "free-for-all" && isPointlessFreeForAll(item.gameSlug);
      if (
        !placeless &&
        item.place !== null &&
        item.fieldSize !== null &&
        item.fieldSize > 2 &&
        item.place > 1
      ) {
        return {
          label: ordinal(item.place),
          tone: item.place === item.fieldSize ? "rose" : "amber",
        };
      }
      return { label: "Lost", tone: "rose" };
    }
  }
}
