// Quiztopia's printed cards as the table game deals them. A card id `c042`
// is a card of the quiz bank's `quiztopia` source (`quiz/content/sources/
// quiztopia.json`); its 12 slots are one printed question per category.
//
// The "extended" deck adds virtual cards: `c042-v3` asks, in every slot, the
// third fact of that slot's article that no game prints (one of the
// questions written alongside the card's). Virtual cards are never stored —
// they are derived from the ref alone.

export const SETS_PER_CARD = 12;
/** Virtual cards per printed card in the extended deck. */
export const VIRTUAL_PER_CARD = 4;

export const CARD_ID_RE = /^c\d{3}$/;
export const CARD_REF_RE = /^c\d{3}(-v[1-4])?$/;

export type QuiztopiaDeck = "original" | "extended";

export interface ParsedCardRef {
  cardId: string;
  /** 0 = the printed card, 1–4 = the virtual card built from the k-th unprinted fact. */
  k: number;
}

export function parseCardRef(ref: string): ParsedCardRef | null {
  if (!CARD_REF_RE.test(ref)) return null;
  return { cardId: ref.slice(0, 4), k: ref.length > 4 ? Number(ref.slice(6)) : 0 };
}

export function cardRef(card: string, k: number): string {
  if (!CARD_ID_RE.test(card)) throw new Error(`bad card id: ${card}`);
  if (k === 0) return card;
  if (!Number.isInteger(k) || k < 1 || k > VIRTUAL_PER_CARD) throw new Error(`bad virtual: ${k}`);
  return `${card}-v${k}`;
}

export function virtualCardRefs(cardIds: readonly string[]): string[] {
  const out: string[] = [];
  for (let k = 1; k <= VIRTUAL_PER_CARD; k++) {
    for (const id of cardIds) out.push(cardRef(id, k));
  }
  return out;
}

/** Every card ref a deck draws from, in a stable order (the engine shuffles). */
export function deckCardRefs(cardIds: readonly string[], deck: QuiztopiaDeck): string[] {
  return deck === "original" ? [...cardIds] : [...cardIds, ...virtualCardRefs(cardIds)];
}
