/**
 * The async AI seam for Decrypto. Core stays pure (no network/SDK deps): the
 * machine's AI actors default to the deterministic fallback, and the server
 * binds its model-backed agent per session with `withDecryptoAgent` (XState
 * `provide`) — no module-global state.
 *
 * SAFETY CONTRACT: the machine wraps every call in a deadline race against the
 * fallback and a `.catch(fallback)`, then sanitizes the output against the
 * rules, so an injected agent may be slow or throw — but the fallback itself
 * must be synchronous-fast, throw-free, and always legal.
 */
import type { Code, DecodeMistake, Digit } from "../types";

export interface RevealedClue {
  round: number;
  clue: string;
  digit: Digit;
}

export type { DecodeMistake } from "../types";

export interface EncryptInput {
  /** GPT model id driving this seat (the seat's strategy string). */
  model: string;
  keywords: [string, string, string, string];
  code: Code;
  round: number;
  /** This team's past clues with their revealed digits — what the enemy also sees. */
  ownRevealedClues: RevealedClue[];
  /** The opposing team's revealed clue history (context only). */
  oppRevealedClues: RevealedClue[];
  /** Normalized clues this team has already used — reuse is illegal. */
  forbiddenClues: string[];
  /**
   * Where this team's own decoding went wrong before — the content behind each
   * miscommunication token. Shows the encryptor exactly which keywords the
   * decoder confuses, so those can be disambiguated harder.
   */
  ownDecodeMistakes: DecodeMistake[];
  tokens: {
    own: { interceptions: number; miscommunications: number };
    opp: { interceptions: number; miscommunications: number };
  };
}

export interface GuessInput {
  model: string;
  purpose: "decode" | "intercept";
  /**
   * The guessing team's own keywords — decode only. ALWAYS null for
   * intercepts: type-level redaction so a prompt bug can never leak the
   * encrypting team's keywords to the interceptor call.
   */
  keywords: [string, string, string, string] | null;
  /** The three clues being guessed at. */
  currentClues: [string, string, string];
  /** The ENCRYPTING team's revealed clue↔digit history — the deduction material. */
  targetRevealedClues: RevealedClue[];
  /**
   * Decode only (empty for intercepts): this team's own past misreads, so the
   * decoder can recalibrate keyword pairs it has already confused once.
   */
  pastDecodeMistakes: DecodeMistake[];
  round: number;
}

export interface DecryptoAiAgent {
  encrypt(input: EncryptInput): Promise<[string, string, string]>;
  guess(input: GuessInput): Promise<Code>;
}
