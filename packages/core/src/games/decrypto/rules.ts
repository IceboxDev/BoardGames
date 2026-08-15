import { type Rng, shuffle } from "../../lib/rng";
import type {
  Code,
  DecodeMistake,
  DecryptoAction,
  DecryptoContext,
  DecryptoResult,
  DecryptoVariant,
  DecryptoViewPhase,
  Digit,
  DraftCode,
  GuessPurpose,
  RevealedClueView,
  Team,
  TeamState,
  Transmission,
} from "./types";
import { INTERCEPTOR_MAX_ROUNDS, STANDARD_MAX_ROUNDS, TOKENS_TO_WIN } from "./types";
import { DECRYPTO_WORDS } from "./words";

// ---------------------------------------------------------------------------
// Decrypto pure rules. Single source of truth for legality, eligibility,
// resolution, and win evaluation — consumed by the machine's guards, the
// validators, the player views, AND the AI sanitizer, so the four can never
// disagree.
// ---------------------------------------------------------------------------

/** All 24 ordered triples of distinct digits 1–4 — the entire code deck. */
export const ALL_CODES: readonly Code[] = (() => {
  const codes: Code[] = [];
  const digits: Digit[] = [1, 2, 3, 4];
  for (const a of digits)
    for (const b of digits)
      for (const c of digits) {
        if (a !== b && a !== c && b !== c) codes.push([a, b, c]);
      }
  return codes;
})();

export function isValidCode(value: unknown): value is Code {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    ALL_CODES.some((code) => code.every((d, i) => d === value[i]))
  );
}

export function drawCode(rng: Rng): Code {
  const code = ALL_CODES[Math.floor(rng() * ALL_CODES.length)] ?? ALL_CODES[0];
  return [...code] as unknown as Code;
}

export function codesEqual(a: Code | null, b: Code | null): boolean {
  return a != null && b != null && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export function maxRounds(variant: DecryptoVariant): number {
  return variant === "interceptor" ? INTERCEPTOR_MAX_ROUNDS : STANDARD_MAX_ROUNDS;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export interface SetupInput {
  variant: DecryptoVariant;
  /** Seat lists per team; variant team 1 is the solo interceptor. */
  teamPlayers: [number[], number[]];
  rng: Rng;
}

export function buildTeams(input: SetupInput): [TeamState, TeamState] {
  const deck = shuffle(DECRYPTO_WORDS, input.rng);
  const draw = (offset: number): [string, string, string, string] =>
    deck.slice(offset, offset + 4) as [string, string, string, string];
  const team = (t: Team): TeamState => ({
    players: input.teamPlayers[t],
    keywords: input.variant === "interceptor" && t === 1 ? null : draw(t * 4),
    interceptions: 0,
    miscommunications: 0,
    usedClues: [],
  });
  return [team(0), team(1)];
}

/** Seat layout convention: standard = [0,1] vs [2,3]; variant = [0,1] vs interceptor seat 2. */
export function defaultTeamPlayers(variant: DecryptoVariant): [number[], number[]] {
  return variant === "interceptor"
    ? [[0, 1], [2]]
    : [
        [0, 1],
        [2, 3],
      ];
}

export function playerCount(variant: DecryptoVariant): number {
  return variant === "interceptor" ? 3 : 4;
}

export function teamOf(ctx: DecryptoContext, seat: number): Team | null {
  if (ctx.teams[0].players.includes(seat)) return 0;
  if (ctx.teams[1].players.includes(seat)) return 1;
  return null;
}

/** Round-robin encryptor: derived from the round number, so no rotation state. */
export function encryptorFor(team: TeamState, round: number): number {
  return team.players[(round - 1) % team.players.length] as number;
}

/** Build this round's transmissions (one per encrypting team). */
export function buildRoundTransmissions(ctx: DecryptoContext, round: number): Transmission[] {
  const encryptingTeams: Team[] = ctx.variant === "interceptor" ? [0] : [0, 1];
  return encryptingTeams.map((team) => ({
    team,
    encryptor: encryptorFor(ctx.teams[team], round),
    code: drawCode(ctx.rng),
    clues: null,
    skipped: false,
    skipReason: null,
    decodeDraft: [null, null, null],
    interceptDraft: [null, null, null],
    decodeGuess: null,
    interceptGuess: null,
    interceptRequired: round > 1,
    resolved: null,
  }));
}

// ---------------------------------------------------------------------------
// Clue legality (mechanical rules only)
// ---------------------------------------------------------------------------

/** Lowercase, trim, collapse internal whitespace — the comparison form of a clue. */
export function normalizeClue(clue: string): string {
  return clue.trim().toLowerCase().replace(/\s+/g, " ");
}

function clueWords(normalized: string): string[] {
  return normalized.split(/[^a-z0-9à-ÿ]+/i).filter((w) => w.length > 0);
}

export type ClueLegality = { ok: true } | { ok: false; reason: string };

/**
 * The mechanically-enforced clue rules: non-empty, no exact (case-insensitive)
 * reuse of a clue this team already gave, the three clues mutually distinct,
 * and no team keyword appearing as a word of a clue (simple plural included).
 * Semantic rules — translations, phonetics, private knowledge — stay
 * honor-system, exactly as at a physical table.
 */
export function checkClueLegality(
  keywords: readonly string[] | null,
  usedClues: readonly string[],
  clues: readonly [string, string, string],
): ClueLegality {
  const normalized = clues.map(normalizeClue);
  for (let i = 0; i < 3; i++) {
    const clue = normalized[i] as string;
    if (clue.length === 0) {
      return { ok: false, reason: `clue ${i + 1} is empty` };
    }
    if (usedClues.includes(clue)) {
      return { ok: false, reason: `clue ${i + 1} reuses a clue your team already gave` };
    }
    if (normalized.indexOf(clue) !== i) {
      return {
        ok: false,
        reason: `clues ${normalized.indexOf(clue) + 1} and ${i + 1} are identical`,
      };
    }
    for (const keyword of keywords ?? []) {
      const kw = keyword.toLowerCase();
      if (clueWords(clue).some((word) => word === kw || word === `${kw}s`)) {
        return { ok: false, reason: `clue ${i + 1} contains your keyword "${keyword}"` };
      }
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phase eligibility
// ---------------------------------------------------------------------------

/** Teams whose encryptor still owes clues this round. */
export function pendingClueTransmissions(ctx: DecryptoContext): Transmission[] {
  return ctx.current.filter((t) => !t.skipped && t.clues === null);
}

export function allCluesDone(ctx: DecryptoContext): boolean {
  return ctx.current.every((t) => t.skipped || t.clues !== null);
}

export function currentTransmission(ctx: DecryptoContext): Transmission | null {
  return ctx.current[ctx.txIdx] ?? null;
}

/** Seats allowed to guess for `purpose` on transmission `tx`. */
export function eligibleSeats(
  ctx: DecryptoContext,
  tx: Transmission,
  purpose: GuessPurpose,
): number[] {
  if (purpose === "decode") {
    return ctx.teams[tx.team].players.filter((seat) => seat !== tx.encryptor);
  }
  const opponent = (1 - tx.team) as Team;
  return ctx.teams[opponent].players;
}

export function isGuessCommitted(tx: Transmission, purpose: GuessPurpose): boolean {
  return (purpose === "decode" ? tx.decodeGuess : tx.interceptGuess) !== null;
}

/** The guess purposes still owed on the resolving transmission. */
export function pendingGuessPurposes(tx: Transmission): GuessPurpose[] {
  if (tx.skipped) return [];
  const pending: GuessPurpose[] = [];
  if (tx.decodeGuess === null) pending.push("decode");
  if (tx.interceptRequired && tx.interceptGuess === null) pending.push("intercept");
  return pending;
}

export function allGuessesDone(tx: Transmission): boolean {
  return pendingGuessPurposes(tx).length === 0;
}

/** A purpose is AI-driven iff no eligible seat for it is human. */
export function guessDrivenByAi(
  ctx: DecryptoContext,
  tx: Transmission,
  purpose: GuessPurpose,
): boolean {
  const seats = eligibleSeats(ctx, tx, purpose);
  return seats.length > 0 && seats.every((seat) => !ctx.humanPlayers.includes(seat));
}

export function isAiSeat(ctx: DecryptoContext, seat: number): boolean {
  return !ctx.humanPlayers.includes(seat);
}

/**
 * Team chat: own team only, at least two members, and never while this seat
 * is the encryptor of a live (unresolved, unskipped) transmission — the
 * rulebook bars the encryptor from their team's discussion until reveal.
 */
export function chatAllowed(ctx: DecryptoContext, seat: number): boolean {
  const team = teamOf(ctx, seat);
  if (team === null) return false;
  if (ctx.teams[team].players.length < 2) return false;
  return !ctx.current.some((t) => t.encryptor === seat && !t.skipped && t.resolved === null);
}

// ---------------------------------------------------------------------------
// Resolution & win evaluation
// ---------------------------------------------------------------------------

/**
 * Resolve the transmission in place-copy style: compare guesses, mark
 * outcomes, and award ALL tokens for it (a skipped transmission counts as a
 * miscommunication; both outcomes can co-occur). Variant: the interceptor
 * gains a token on an exact intercept AND another when the team's decode
 * fails — both official rules, both applicable in the same round.
 */
export function resolveTransmission(ctx: DecryptoContext): {
  current: Transmission[];
  teams: [TeamState, TeamState];
} {
  const tx = currentTransmission(ctx);
  if (!tx || tx.resolved !== null) return { current: ctx.current, teams: ctx.teams };

  const intercepted = tx.interceptRequired && codesEqual(tx.interceptGuess, tx.code);
  const miscommunicated = tx.skipped || !codesEqual(tx.decodeGuess, tx.code);

  const teams = ctx.teams.map((t) => ({ ...t })) as [TeamState, TeamState];
  const opponent = (1 - tx.team) as Team;
  if (miscommunicated) teams[tx.team].miscommunications += 1;
  if (ctx.variant === "interceptor") {
    // Both award paths feed the interceptor's single token pool.
    if (intercepted) teams[1].interceptions += 1;
    if (miscommunicated) teams[1].interceptions += 1;
  } else if (intercepted) {
    teams[opponent].interceptions += 1;
  }

  const current = ctx.current.map((t, i) =>
    i === ctx.txIdx ? { ...t, resolved: { intercepted, miscommunicated } } : t,
  );
  return { current, teams };
}

export function pointsFor(team: TeamState): number {
  return team.interceptions - team.miscommunications;
}

/**
 * End-of-round evaluation — the ONLY place win/loss is checked, after both
 * transmissions resolve (tokens from the whole round count together, and the
 * simultaneous-threshold cases fall through to the points tiebreak).
 */
export function evaluateRoundEnd(ctx: DecryptoContext): DecryptoResult | null {
  const points: [number, number] = [pointsFor(ctx.teams[0]), pointsFor(ctx.teams[1])];
  const base = { points, rounds: ctx.round };

  if (ctx.variant === "interceptor") {
    if (ctx.teams[1].interceptions >= TOKENS_TO_WIN) {
      return { winner: 1, reason: "interceptor-tokens", ...base };
    }
    if (ctx.round >= INTERCEPTOR_MAX_ROUNDS) {
      return { winner: 0, reason: "survived", ...base };
    }
    return null;
  }

  const won = ctx.teams.map((t) => t.interceptions >= TOKENS_TO_WIN);
  const lost = ctx.teams.map((t) => t.miscommunications >= TOKENS_TO_WIN);
  const ambiguous =
    (won[0] && lost[0]) || (won[1] && lost[1]) || (won[0] && won[1]) || (lost[0] && lost[1]);

  if (!ambiguous) {
    if (won[0] || lost[1])
      return { winner: 0, reason: won[0] ? "interceptions" : "miscommunications", ...base };
    if (won[1] || lost[0])
      return { winner: 1, reason: won[1] ? "interceptions" : "miscommunications", ...base };
    if (ctx.round < STANDARD_MAX_ROUNDS) return null;
  }

  // Simultaneous thresholds, or the round-8 hard stop: points tiebreak, then shared.
  if (points[0] > points[1]) return { winner: 0, reason: "points", ...base };
  if (points[1] > points[0]) return { winner: 1, reason: "points", ...base };
  return { reason: "shared", ...base };
}

// ---------------------------------------------------------------------------
// Revealed-clue history (the public note sheet + the AI's deduction material)
// ---------------------------------------------------------------------------

/** Every clue of `team` whose digit has been revealed, oldest first. */
export function revealedCluesFor(ctx: DecryptoContext, team: Team): RevealedClueView[] {
  const out: RevealedClueView[] = [];
  const scan = (transmissions: Transmission[], round: number) => {
    for (const t of transmissions) {
      if (t.team !== team || t.resolved === null || t.clues === null) continue;
      t.clues.forEach((clue, i) => {
        out.push({ round, clue, digit: t.code[i] as Digit });
      });
    }
  };
  for (const record of ctx.history) scan(record.transmissions, record.round);
  scan(ctx.current, ctx.round);
  return out;
}

/**
 * Every position where `team` decoded its own transmission wrongly, oldest
 * first — the content behind each miscommunication token. Feeds the agents
 * (an encryptor disambiguates exactly the keywords its decoder confused) and
 * is derivable by every player at the table, so it leaks nothing.
 */
export function decodeMistakesFor(ctx: DecryptoContext, team: Team): DecodeMistake[] {
  const out: DecodeMistake[] = [];
  const scan = (transmissions: Transmission[], round: number) => {
    for (const t of transmissions) {
      if (t.team !== team || t.resolved === null || t.clues === null) continue;
      if (!t.resolved.miscommunicated) continue;
      t.clues.forEach((clue, i) => {
        const meant = t.code[i] as Digit;
        const guessed = t.decodeGuess?.[i] ?? null;
        if (guessed !== meant) out.push({ round, clue, meantDigit: meant, decodedAs: guessed });
      });
    }
  };
  for (const record of ctx.history) scan(record.transmissions, record.round);
  scan(ctx.current, ctx.round);
  return out;
}

// ---------------------------------------------------------------------------
// Engine transitions — throw on illegal input; the machine wraps them in
// `safeApply` and `validateAction` pre-rejects with the same predicates.
// ---------------------------------------------------------------------------

type CtxPatch = Partial<DecryptoContext>;

export function applySubmitClues(
  ctx: DecryptoContext,
  seat: number,
  clues: [string, string, string],
): CtxPatch {
  const idx = ctx.current.findIndex((t) => !t.skipped && t.clues === null && t.encryptor === seat);
  const tx = ctx.current[idx];
  if (!tx) throw new Error("you have no clues to give right now");
  const team = ctx.teams[tx.team];
  const legality = checkClueLegality(team.keywords, team.usedClues, clues);
  if (!legality.ok) throw new Error(legality.reason);

  const trimmed = clues.map((c) => c.trim()) as [string, string, string];
  const teams = ctx.teams.map((t, i) =>
    i === tx.team ? { ...t, usedClues: [...t.usedClues, ...trimmed.map(normalizeClue)] } : t,
  ) as [TeamState, TeamState];
  const current = ctx.current.map((t, i) => (i === idx ? { ...t, clues: trimmed } : t));
  return { current, teams };
}

export function applyDraft(
  ctx: DecryptoContext,
  seat: number,
  purpose: GuessPurpose,
  slot: 0 | 1 | 2,
  digit: Digit | null,
): CtxPatch {
  const tx = currentTransmission(ctx);
  if (!tx || tx.skipped || tx.clues === null) throw new Error("nothing to guess right now");
  if (!eligibleSeats(ctx, tx, purpose).includes(seat)) {
    throw new Error("you are not part of this guess");
  }
  if (purpose === "intercept" && !tx.interceptRequired) {
    throw new Error("no interception attempts in round 1");
  }
  if (isGuessCommitted(tx, purpose)) throw new Error("your team already committed its guess");

  const key = purpose === "decode" ? "decodeDraft" : "interceptDraft";
  const draft = [...tx[key]] as DraftCode;
  draft[slot] = digit;
  const current = ctx.current.map((t, i) => (i === ctx.txIdx ? { ...t, [key]: draft } : t));
  return { current };
}

export function applyGuess(
  ctx: DecryptoContext,
  seat: number,
  purpose: GuessPurpose,
  code: Code,
): CtxPatch {
  const tx = currentTransmission(ctx);
  if (!tx || tx.skipped || tx.clues === null) throw new Error("nothing to guess right now");
  if (!eligibleSeats(ctx, tx, purpose).includes(seat)) {
    throw new Error("you are not part of this guess");
  }
  if (purpose === "intercept" && !tx.interceptRequired) {
    throw new Error("no interception attempts in round 1");
  }
  if (isGuessCommitted(tx, purpose)) throw new Error("your team already committed its guess");
  if (!isValidCode(code)) throw new Error("a code is three different digits from 1 to 4");

  const key = purpose === "decode" ? "decodeGuess" : "interceptGuess";
  const current = ctx.current.map((t, i) =>
    i === ctx.txIdx ? { ...t, [key]: [...code] as Code } : t,
  );
  return { current };
}

export function applyChat(ctx: DecryptoContext, seat: number, text: string): CtxPatch {
  if (!chatAllowed(ctx, seat)) {
    throw new Error("the encryptor can't talk to their team until their code is revealed");
  }
  const team = teamOf(ctx, seat) as Team;
  return { chat: [...ctx.chat, { seat, team, round: ctx.round, text: text.trim() }] };
}

// ---------------------------------------------------------------------------
// Legal-action enumeration (drives the client UI and the structural validator)
// ---------------------------------------------------------------------------

const DRAFT_DIGITS: (Digit | null)[] = [1, 2, 3, 4, null];
const DRAFT_SLOTS: (0 | 1 | 2)[] = [0, 1, 2];

/**
 * Enumerable actions only — `submit-clues` (free text) and `chat` are
 * validated by schema + engine predicates instead, and the UI derives those
 * affordances from the view's `myPending`/`chat` fields.
 */
export function legalActionsFor(
  ctx: DecryptoContext,
  phase: DecryptoViewPhase,
  seat: number,
): DecryptoAction[] {
  if (phase !== "guessing") return [];
  const tx = currentTransmission(ctx);
  if (!tx || tx.skipped || tx.clues === null) return [];

  const actions: DecryptoAction[] = [];
  const purposes: GuessPurpose[] = ["decode", "intercept"];
  for (const purpose of purposes) {
    if (purpose === "intercept" && !tx.interceptRequired) continue;
    if (isGuessCommitted(tx, purpose)) continue;
    if (!eligibleSeats(ctx, tx, purpose).includes(seat)) continue;
    for (const slot of DRAFT_SLOTS) {
      for (const digit of DRAFT_DIGITS) {
        actions.push({ kind: "set-draft", purpose, slot, digit });
      }
    }
    for (const code of ALL_CODES) {
      actions.push({ kind: "submit-guess", purpose, code: [...code] as Code });
    }
  }
  return actions;
}
