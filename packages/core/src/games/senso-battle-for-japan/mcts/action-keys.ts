// Action keys turn a sampled world's legal cards into the information-set
// tree's children.
//
// Own cards: two cards of one suit are interchangeable for the root player
// when no card of that suit that is still in play elsewhere lies between them
// (whatever the hidden hands are, they beat and lose to exactly the same
// cards). Collapsing them
// is exact and determinization-independent; the representative is the lowest.
//
// Opponent cards: the root player cannot tell two hidden cards apart when the
// same set of cards it KNOWS (own hand + played) lies below each. Bucket
// them by `suit:knownBelow`. Exact in 2p (every other unseen card is dead or
// mine); an abstraction in 3–5p. Ninjas keep their own keys.

import {
  CARD_ID,
  CARD_RANK,
  CARD_SUIT,
  type FastRound,
  JADE,
  N_CARDS,
  PLAYED,
  WOOD,
} from "./fast-round";

export interface KeyTable {
  /** Key for a card when the ROOT seat plays it (own equivalence classes). */
  own: string[];
  /** Representative (lowest) card of each own class, keyed by class key. */
  ownRep: Map<string, number>;
  /** Key for a card when another seat plays it. */
  other: string[];
}

export function buildKeyTable(base: FastRound, me: number, buckets: boolean): KeyTable {
  const own = new Array<string>(N_CARDS).fill("");
  const other = new Array<string>(N_CARDS).fill("");
  const ownRep = new Map<string, number>();

  // Own classes: walk each suit by rank; an unseen card of that suit breaks the class.
  for (let suit = 0; suit < 4; suit++) {
    let rep = -1;
    let gap = true;
    for (let rank = 2; rank <= 14; rank++) {
      const card = cardOf(suit, rank);
      const owner = base.owner[card];
      if (owner === me) {
        if (gap || rep === -1) rep = card;
        gap = false;
        own[card] = CARD_ID[rep];
        ownRep.set(CARD_ID[rep], rep);
      } else if (owner !== PLAYED) {
        // Any card that is not mine and not gone (hidden, or another seat's in
        // a fully known world) separates the classes above and below it.
        gap = true;
      }
    }
  }
  own[WOOD] = CARD_ID[WOOD];
  own[JADE] = CARD_ID[JADE];
  ownRep.set(CARD_ID[WOOD], WOOD);
  ownRep.set(CARD_ID[JADE], JADE);

  // Opponent buckets.
  for (let suit = 0; suit < 4; suit++) {
    let known = 0;
    for (let rank = 2; rank <= 14; rank++) {
      const card = cardOf(suit, rank);
      other[card] = buckets ? `${suit}:${known}` : CARD_ID[card];
      const owner = base.owner[card];
      if (owner === me || owner === PLAYED) known++;
    }
  }
  other[WOOD] = CARD_ID[WOOD];
  other[JADE] = CARD_ID[JADE];
  return { own, ownRep, other };
}

export function cardOf(suit: number, rank: number): number {
  return suit * 13 + (rank - 2);
}

// Sanity: FULL_DECK is CLANS × RANKS then the two Ninjas, so the formula above
// must agree with the card tables.
for (let suit = 0; suit < 4; suit++) {
  for (let rank = 2; rank <= 14; rank++) {
    const card = cardOf(suit, rank);
    if (CARD_SUIT[card] !== suit || CARD_RANK[card] !== rank) {
      throw new Error("FULL_DECK order changed: update action-keys.cardOf");
    }
  }
}
