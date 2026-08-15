/**
 * Deterministic fallback agent: synchronous-fast, throw-free, always legal.
 *
 * This is the floor under every AI seat — it answers when no OPENAI_API_KEY is
 * configured, when the GPT call errors, and when the 45s deadline fires. It is
 * degenerate ON PURPOSE: a stalled LLM should cost the AI team the round (its
 * teammates can't read "signal 3.1"), never the session.
 *
 * Determinism matters for replays: guesses derive from a stable hash of the
 * input, not from randomness.
 */
import { ALL_CODES } from "../rules";
import type { Code } from "../types";
import type { DecryptoAiAgent, EncryptInput, GuessInput } from "./agent";

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Unique-by-construction clue tokens. Contains digits/dots only around the
 * word "signal", so it can never equal a keyword; uniqueness against the
 * team's used-clue list is guaranteed by suffixing (humans could type
 * "signal 3.1" on purpose, so the loop is not paranoia).
 */
export function fallbackClues(input: EncryptInput): [string, string, string] {
  const used = new Set(input.forbiddenClues);
  const make = (slot: number): string => {
    let clue = `signal ${input.round}.${slot}`;
    while (used.has(clue)) clue = `${clue}x`;
    used.add(clue);
    return clue;
  };
  return [make(1), make(2), make(3)];
}

export function fallbackGuess(input: GuessInput): Code {
  const key = `${input.purpose}|${input.round}|${input.currentClues.join("§")}`;
  const code = ALL_CODES[hashString(key) % ALL_CODES.length] as Code;
  return [...code] as unknown as Code;
}

export const fallbackDecryptoAgent: DecryptoAiAgent = {
  encrypt: (input) => Promise.resolve(fallbackClues(input)),
  guess: (input) => Promise.resolve(fallbackGuess(input)),
};
