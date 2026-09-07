import { isNinja, rankOf, suitOf } from "@boardgames/core/games/senso-battle-for-japan/deck";
import type { CardId, Rank } from "@boardgames/core/games/senso-battle-for-japan/types";
import {
  CLAN_SHORT,
  NINJA_LABELS,
  RANK_LABELS,
} from "@boardgames/core/games/senso-battle-for-japan/types";

/** "K" for a King, "忍" for a Ninja. */
export function rankGlyph(card: CardId): string {
  if (isNinja(card)) return "忍";
  return RANK_LABELS[rankOf(card) as Rank];
}

/** Compact label for logs and tooltips: "武K", "Jade Ninja". */
export function cardLabel(card: CardId): string {
  if (isNinja(card)) return NINJA_LABELS[card];
  const suit = suitOf(card);
  return `${suit ? CLAN_SHORT[suit] : "?"}${rankGlyph(card)}`;
}

/** Spoken label for screen readers: "King of Takeda", "Jade Ninja". */
export function cardSpokenLabel(card: CardId): string {
  if (isNinja(card)) return NINJA_LABELS[card];
  const suit = suitOf(card);
  const rank = rankGlyph(card);
  const rankWord =
    rank === "A"
      ? "Ace"
      : rank === "K"
        ? "King"
        : rank === "Q"
          ? "Queen"
          : rank === "J"
            ? "Jack"
            : rank;
  return `${rankWord} of ${suit ? suit.charAt(0).toUpperCase() + suit.slice(1) : "?"}`;
}
