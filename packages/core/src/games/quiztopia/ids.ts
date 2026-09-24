// Stable content ids. Everything the trainer stores per user hangs off a
// question id, so the scheme is positional (card, set, question) and never
// derived from text: `c042` is the 42nd card in the import order, `c042-s07`
// its 7th set (category 7), `c042-s07-q0` that set's original card question
// and `q1`…`q4` the four sibling questions.
//
// The "extended" deck recombines siblings into virtual cards: `c042-v3` is a
// 12-question card made of every set's third sibling (`c042-s01-q3` …
// `c042-s12-q3`). Virtual cards are never materialised — they are derived
// from the id alone.

import { createRng, shuffle } from "../../lib/rng.ts";

export const SETS_PER_CARD = 12;
export const QUESTIONS_PER_SET = 5;
export const SIBLINGS_PER_SET = QUESTIONS_PER_SET - 1;

export const CARD_ID_RE = /^c\d{3}$/;
export const SET_ID_RE = /^c\d{3}-s(0[1-9]|1[0-2])$/;
export const QUESTION_ID_RE = /^c\d{3}-s(0[1-9]|1[0-2])-q[0-4]$/;
export const CARD_REF_RE = /^c\d{3}(-v[1-4])?$/;

export type QuiztopiaDeck = "original" | "extended";

export function cardId(ordinal: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 999) {
    throw new Error(`card ordinal out of range: ${ordinal}`);
  }
  return `c${String(ordinal).padStart(3, "0")}`;
}

export function setId(card: string, n: number): string {
  if (!CARD_ID_RE.test(card)) throw new Error(`bad card id: ${card}`);
  if (!Number.isInteger(n) || n < 1 || n > SETS_PER_CARD) throw new Error(`bad set n: ${n}`);
  return `${card}-s${String(n).padStart(2, "0")}`;
}

export function questionId(set: string, q: number): string {
  if (!SET_ID_RE.test(set)) throw new Error(`bad set id: ${set}`);
  if (!Number.isInteger(q) || q < 0 || q >= QUESTIONS_PER_SET) throw new Error(`bad q: ${q}`);
  return `${set}-q${q}`;
}

export interface ParsedSetId {
  cardId: string;
  n: number;
}

export interface ParsedQuestionId extends ParsedSetId {
  setId: string;
  q: number;
}

export function parseSetId(id: string): ParsedSetId | null {
  if (!SET_ID_RE.test(id)) return null;
  return { cardId: id.slice(0, 4), n: Number(id.slice(6, 8)) };
}

export function parseQuestionId(id: string): ParsedQuestionId | null {
  if (!QUESTION_ID_RE.test(id)) return null;
  const set = id.slice(0, 8);
  return { cardId: id.slice(0, 4), setId: set, n: Number(id.slice(6, 8)), q: Number(id.slice(10)) };
}

export interface ParsedCardRef {
  cardId: string;
  /** 0 = the original card, 1–4 = the virtual card built from that sibling. */
  q: number;
}

export function parseCardRef(ref: string): ParsedCardRef | null {
  if (!CARD_REF_RE.test(ref)) return null;
  return { cardId: ref.slice(0, 4), q: ref.length > 4 ? Number(ref.slice(6)) : 0 };
}

export function cardRef(card: string, q: number): string {
  if (!CARD_ID_RE.test(card)) throw new Error(`bad card id: ${card}`);
  if (q === 0) return card;
  if (!Number.isInteger(q) || q < 1 || q > SIBLINGS_PER_SET) throw new Error(`bad sibling: ${q}`);
  return `${card}-v${q}`;
}

/** The question id a card ref resolves to for category `n`. */
export function questionIdForRef(ref: string, n: number): string | null {
  const parsed = parseCardRef(ref);
  if (!parsed) return null;
  return questionId(setId(parsed.cardId, n), parsed.q);
}

export function virtualCardRefs(cardIds: readonly string[]): string[] {
  const out: string[] = [];
  for (let q = 1; q <= SIBLINGS_PER_SET; q++) {
    for (const id of cardIds) out.push(cardRef(id, q));
  }
  return out;
}

/** Every card ref a deck draws from, in a stable order (the engine shuffles). */
export function deckCardRefs(cardIds: readonly string[], deck: QuiztopiaDeck): string[] {
  return deck === "original" ? [...cardIds] : [...cardIds, ...virtualCardRefs(cardIds)];
}

/**
 * The order new trainer questions of category `n` are introduced in: every
 * card's original question first (those are the ones a table game asks),
 * then the first siblings, and so on.
 */
export function newIntroductionOrder(cardIds: readonly string[], n: number): string[] {
  const out: string[] = [];
  for (let q = 0; q < QUESTIONS_PER_SET; q++) {
    for (const id of cardIds) out.push(questionId(setId(id, n), q));
  }
  return out;
}

/**
 * The same tiers (all originals, then first siblings, …) but with the cards
 * shuffled inside each tier by a seeded RNG — so a learner meets the deck in
 * a random order that is nevertheless stable for them (seed the user id), not
 * card c001 first for everyone.
 */
export function shuffledIntroductionOrder(
  cardIds: readonly string[],
  n: number,
  seed: number,
): string[] {
  const rng = createRng(seed);
  const out: string[] = [];
  for (let q = 0; q < QUESTIONS_PER_SET; q++) {
    for (const id of shuffle(cardIds, rng)) out.push(questionId(setId(id, n), q));
  }
  return out;
}

/** FNV-1a over a string → a 32-bit seed for `createRng`. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Whole sets instead of tiers: the cards shuffled once (seeded like
 * `shuffledIntroductionOrder`), each contributing its set's five questions
 * back to back — original first — so a learner meets a topic all at once.
 */
export function shuffledSetOrder(cardIds: readonly string[], n: number, seed: number): string[] {
  const rng = createRng(seed);
  const out: string[] = [];
  for (const id of shuffle(cardIds, rng)) {
    for (let q = 0; q < QUESTIONS_PER_SET; q++) out.push(questionId(setId(id, n), q));
  }
  return out;
}
