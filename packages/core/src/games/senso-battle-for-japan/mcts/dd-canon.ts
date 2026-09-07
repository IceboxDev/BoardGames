// Canonical relative-rank form of a trick-boundary position.
//
// Once played and undealt cards are gone, trick resolution (`winKey`) only
// ever compares ranks WITHIN a suit and follow-suit only needs suit
// membership, so a position is fully described by: for each suit, the owner
// of each in-play card in rank order; who holds each Ninja still in play;
// which suit is trump; and the leader. The three non-trump suits are
// interchangeable, so their words are sorted. Seats stay absolute: the leaf a
// caller attaches to a position is seat-specific, and the trick counts so far
// travel with the key for the same reason.

import { CARD_SUIT, type FastRound, JADE, WOOD } from "./fast-round";

const OWNER_CHARS = "01234";

/** Per-suit owner words (index = suit) plus the two Ninja slots. */
export function suitWords(f: FastRound): { words: string[]; wood: string; jade: string } {
  const words = ["", "", "", ""];
  for (let suit = 0; suit < 4; suit++) {
    const base = suit * 13;
    let word = "";
    for (let i = 0; i < 13; i++) {
      const o = f.owner[base + i];
      if (o >= 0) word += OWNER_CHARS[o];
    }
    words[suit] = word;
  }
  const wood = f.owner[WOOD] >= 0 ? OWNER_CHARS[f.owner[WOOD]] : "-";
  const jade = f.owner[JADE] >= 0 ? OWNER_CHARS[f.owner[JADE]] : "-";
  return { words, wood, jade };
}

/**
 * Position part of the key: `trumpWord|sorted non-trump words|ninjas|leader`.
 * Equal keys ⇒ identical trick-phase futures (for any seat-symmetric or
 * seat-attached valuation). Must be called at a trick boundary.
 */
export function positionKey(f: FastRound): string {
  const { words, wood, jade } = suitWords(f);
  const others: string[] = [];
  for (let suit = 0; suit < 4; suit++) if (suit !== f.trump) others.push(words[suit]);
  others.sort();
  return `${words[f.trump]}|${others[0]}|${others[1]}|${others[2]}|${wood}${jade}|${f.leader}`;
}

/** `positionKey` plus the trick counts so far — the transposition key for a leaf-valued solve. */
export function canonicalKey(f: FastRound): string {
  let key = positionKey(f);
  key += "|";
  for (let s = 0; s < f.n; s++) key += `${f.tricksWon[s]},`;
  return key;
}

// Sanity: the suit words rely on FULL_DECK's clan-major, rank-ascending order.
for (let suit = 0; suit < 4; suit++) {
  if (CARD_SUIT[suit * 13] !== suit || CARD_SUIT[suit * 13 + 12] !== suit) {
    throw new Error("FULL_DECK order changed: update dd-canon.suitWords");
  }
}
