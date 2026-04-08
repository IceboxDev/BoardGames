import type { Card } from "@boardgames/core/games/sushi-go/types";
import {
  DUMPLING_SCORES,
  isNigiri,
  makiCount,
  nigiriValue,
} from "@boardgames/core/games/sushi-go/types";

export interface TableauGroups {
  maki: { cards: Card[]; totalPips: number };
  nigiri: {
    boosted: { nigiri: Card; wasabi: Card }[];
    unboosted: Card[];
    unusedWasabi: Card[];
    points: number;
  };
  tempura: {
    completePairs: [Card, Card][];
    remainder: Card[];
    points: number;
  };
  sashimi: {
    completeTriples: [Card, Card, Card][];
    remainder: Card[];
    points: number;
  };
  dumpling: {
    cards: Card[];
    points: number;
  };
  pudding: { count: number; currentRoundCards: Card[] };
  chopsticks: { cards: Card[] };
}

export function groupTableau(
  tableau: Card[],
  wasabiBoostedNigiriIds: number[],
  puddings: number,
): TableauGroups {
  const makiCards: Card[] = [];
  const nigiriCards: Card[] = [];
  const wasabiCards: Card[] = [];
  const tempuraCards: Card[] = [];
  const sashimiCards: Card[] = [];
  const dumplingCards: Card[] = [];
  const chopsticksCards: Card[] = [];
  const puddingCards: Card[] = [];

  for (const card of tableau) {
    if (makiCount(card.type) > 0) makiCards.push(card);
    else if (isNigiri(card.type)) nigiriCards.push(card);
    else if (card.type === "wasabi") wasabiCards.push(card);
    else if (card.type === "tempura") tempuraCards.push(card);
    else if (card.type === "sashimi") sashimiCards.push(card);
    else if (card.type === "dumpling") dumplingCards.push(card);
    else if (card.type === "chopsticks") chopsticksCards.push(card);
    else if (card.type === "pudding") puddingCards.push(card);
  }

  // Pair boosted nigiri with wasabi
  const boostedSet = new Set(wasabiBoostedNigiriIds);
  const boosted: { nigiri: Card; wasabi: Card }[] = [];
  const unboosted: Card[] = [];
  const usedWasabiIds = new Set<number>();

  for (const n of nigiriCards) {
    if (boostedSet.has(n.id)) {
      // Find an unused wasabi to pair with
      const w = wasabiCards.find((wc) => !usedWasabiIds.has(wc.id));
      if (w) {
        usedWasabiIds.add(w.id);
        boosted.push({ nigiri: n, wasabi: w });
      } else {
        // Boosted but no wasabi card found (shouldn't happen, but be safe)
        boosted.push({ nigiri: n, wasabi: n }); // fallback
      }
    } else {
      unboosted.push(n);
    }
  }
  const unusedWasabi = wasabiCards.filter((w) => !usedWasabiIds.has(w.id));

  // Nigiri points
  let nigiriPoints = 0;
  for (const n of nigiriCards) {
    const base = nigiriValue(n.type);
    nigiriPoints += boostedSet.has(n.id) ? base * 3 : base;
  }

  // Tempura: pairs
  const tempuraPairs: [Card, Card][] = [];
  for (let i = 0; i + 1 < tempuraCards.length; i += 2) {
    tempuraPairs.push([tempuraCards[i], tempuraCards[i + 1]]);
  }
  const tempuraRemainder =
    tempuraCards.length % 2 === 1 ? [tempuraCards[tempuraCards.length - 1]] : [];

  // Sashimi: triples
  const sashimiTriples: [Card, Card, Card][] = [];
  for (let i = 0; i + 2 < sashimiCards.length; i += 3) {
    sashimiTriples.push([sashimiCards[i], sashimiCards[i + 1], sashimiCards[i + 2]]);
  }
  const sashimiRemainder = sashimiCards.slice(sashimiTriples.length * 3);

  // Dumpling points
  const clampedDumplings = Math.min(dumplingCards.length, DUMPLING_SCORES.length - 1);
  const dumplingPoints = DUMPLING_SCORES[clampedDumplings];

  return {
    maki: {
      cards: makiCards,
      totalPips: makiCards.reduce((s, c) => s + makiCount(c.type), 0),
    },
    nigiri: { boosted, unboosted, unusedWasabi, points: nigiriPoints },
    tempura: {
      completePairs: tempuraPairs,
      remainder: tempuraRemainder,
      points: tempuraPairs.length * 5,
    },
    sashimi: {
      completeTriples: sashimiTriples,
      remainder: sashimiRemainder,
      points: sashimiTriples.length * 10,
    },
    dumpling: { cards: dumplingCards, points: dumplingPoints },
    pudding: { count: puddings + puddingCards.length, currentRoundCards: puddingCards },
    chopsticks: { cards: chopsticksCards },
  };
}

/** Check if any station has content to display */
export function hasAnyCards(groups: TableauGroups): boolean {
  return (
    groups.maki.cards.length > 0 ||
    groups.nigiri.boosted.length > 0 ||
    groups.nigiri.unboosted.length > 0 ||
    groups.nigiri.unusedWasabi.length > 0 ||
    groups.tempura.completePairs.length > 0 ||
    groups.tempura.remainder.length > 0 ||
    groups.sashimi.completeTriples.length > 0 ||
    groups.sashimi.remainder.length > 0 ||
    groups.dumpling.cards.length > 0 ||
    groups.pudding.count > 0 ||
    groups.chopsticks.cards.length > 0
  );
}
