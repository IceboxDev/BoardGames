/**
 * The deterministic stand-in agent: what AI seats do with no model attached
 * (tests, no API key, AI suspended) and what replaces a model that times out
 * or misbehaves. It is weak by design but always legal and never throws.
 */
import { clueProblem } from "../clue-rules";
import type { Language } from "../words";
import type { ClueInput, ClueOutput, CodenamesAiAgent, GuessInput, GuessOutput } from "./agent";

/** Generic words to fall back on — tried in order until one is legal. */
const FALLBACK_CLUES: Record<Language, readonly string[]> = {
  en: [
    "thing",
    "object",
    "idea",
    "place",
    "stuff",
    "item",
    "matter",
    "concept",
    "notion",
    "entity",
  ],
  de: ["Ding", "Sache", "Idee", "Ort", "Zeug", "Objekt", "Begriff", "Gegenstand", "Wesen", "Etwas"],
};

/** FNV-1a over a string — a stable pick without an RNG. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function fallbackClue(input: ClueInput): ClueOutput {
  const faceUp = input.cards.filter((c) => !c.revealed).map((c) => c.word);
  const legal = (w: string) => clueProblem(w, faceUp, input.language) === null;
  // Every bank word clashing with the table is impossible in practice, but the
  // fallback must stay total: some "zq…" string clashes with no real word.
  const word =
    FALLBACK_CLUES[input.language].find(legal) ??
    Array.from({ length: 26 }, (_, i) => `zq${String.fromCharCode(97 + i)}`).find(legal) ??
    "zqzqzq";
  const target = input.cards.find((c) => !c.revealed && c.kind === "own");
  return { word, count: 1, ...(target ? { targets: [target.index] } : {}), standIn: true };
}

export function fallbackGuess(input: GuessInput): GuessOutput {
  if (input.words.length === 0) return { picks: [], standIn: true };
  const seed = hash(`${input.clue.word}|${input.words.map((w) => w.word).join(",")}`);
  const pick = input.words[seed % input.words.length];
  return { picks: pick ? [pick.index] : [], standIn: true };
}

export const fallbackCodenamesAgent: CodenamesAiAgent = {
  giveClue: async (input) => fallbackClue(input),
  guess: async (input) => fallbackGuess(input),
};
