import {
  canonicalDecryptoModel,
  DECRYPTO_AI_MODELS,
} from "@boardgames/core/games/decrypto/ai/models";
import { clueWords, normalizeClue } from "@boardgames/core/games/decrypto/rules";
import type {
  Code,
  DecryptoPlayerView,
  DraftCode,
  Team,
  TransmissionView,
} from "@boardgames/core/games/decrypto/types";
import { teamLabel } from "./labels";

// What the Wireless Room desk derives from the player view: names, each
// operator's lamp, the last revealed code, the clue linter. Pure functions,
// no React.

export type LampState = "off" | "work" | "done" | "bad";

/** "4-1-3", or "?-?-?" for a code nobody can see. */
export function fmtCode(code: readonly (number | null)[] | null): string {
  return code ? code.map((d) => d ?? "?").join("-") : "?-?-?";
}

/** The AI tier's name ("Analyst") for an AI seat's strategy id. */
export function tierName(model: string | null): string {
  const id = canonicalDecryptoModel(model ?? "");
  return DECRYPTO_AI_MODELS.find((m) => m.id === id)?.label ?? "AI operator";
}

/** A seat as the desk names it: "You", a person's name, or the AI tier. */
export function operatorName(
  view: DecryptoPlayerView,
  seat: number,
  playerNames: readonly (string | null)[],
): string {
  if (seat === view.seat) return "You";
  const name = playerNames[seat];
  if (name) return name;
  const entry = view.seats.find((s) => s.seat === seat);
  return entry?.isAi ? tierName(entry.model) : `Seat ${seat + 1}`;
}

/** Names of a team's seats other than `except`, "Both Analysts" when they match. */
export function teamNames(
  view: DecryptoPlayerView,
  team: Team,
  playerNames: readonly (string | null)[],
  except?: number,
): string {
  const names = view.seats
    .filter((s) => s.team === team && s.seat !== except)
    .map((s) => operatorName(view, s.seat, playerNames));
  if (names.length === 2 && names[0] === names[1]) return `Both ${names[0]}s`;
  return names.join(" & ");
}

/** Chat exists only when the viewer has a teammate who is a person. */
export function hasHumanTeammate(view: DecryptoPlayerView): boolean {
  return view.seats.some((s) => s.team === view.team && s.seat !== view.seat && !s.isAi);
}

/** Every clue the team gave in a revealed round, normalized → round. */
export function usedCluesByRound(view: DecryptoPlayerView, team: Team): Map<string, number> {
  const used = new Map<string, number>();
  for (const summary of view.roundSummaries) {
    for (const t of summary.transmissions) {
      if (t.team !== team || !t.clues) continue;
      for (const clue of t.clues) {
        const n = normalizeClue(clue);
        if (!used.has(n)) used.set(n, summary.round);
      }
    }
  }
  return used;
}

export interface ClueProblem {
  /** The line (0–2) the problem is on. */
  line: number;
  text: string;
}

/**
 * The first rule the typed lines break, worded for the typing sheet. Blank
 * lines are skipped (the sheet says so only once the player tries to send).
 * The rules are core's `checkClueLegality`, which the server runs.
 */
export function clueProblem(
  view: DecryptoPlayerView,
  lines: readonly [string, string, string],
  maxLength: number,
): ClueProblem | null {
  const used = usedCluesByRound(view, view.team);
  const normalized = lines.map(normalizeClue);
  for (let i = 0; i < 3; i++) {
    const raw = (lines[i] ?? "").trim();
    if (!raw) continue;
    if (raw.length > maxLength) {
      return { line: i, text: `Too long — line ${i + 1} is ${raw.length}/${maxLength}` };
    }
    const n = normalized[i] ?? "";
    const round = used.get(n);
    if (round !== undefined)
      return { line: i, text: `Reused — “${raw}” went out in round ${round}` };
    const first = normalized.indexOf(n);
    if (first !== i) return { line: i, text: `Duplicate — lines ${first + 1} and ${i + 1} match` };
    for (const keyword of view.myKeywords ?? []) {
      const kw = keyword.toLowerCase();
      if (clueWords(n).some((w) => w === kw || w === `${kw}s`)) {
        return { line: i, text: `Keyword — “${raw}” contains ${keyword}` };
      }
    }
  }
  return null;
}

/** A completed draft: three distinct digits. */
export function draftComplete(draft: DraftCode | null): draft is Code {
  return !!draft && draft.every((d) => d !== null) && new Set(draft).size === 3;
}

export interface LastReveal {
  round: number;
  team: Team;
  code: Code;
  decodeGuess: Code | null;
  interceptGuess: Code | null;
  intercepted: boolean;
  miscommunicated: boolean;
}

/** The most recent revealed transmission (other than `exclude`), for the "Last" card. */
export function lastReveal(
  view: DecryptoPlayerView,
  exclude: TransmissionView | null,
): LastReveal | null {
  const live = view.transmissions.filter((t) => t.resolved && t !== exclude);
  const t = live[live.length - 1];
  if (t?.resolved) {
    const r = t.resolved;
    return {
      round: view.round,
      team: t.team,
      code: r.code,
      decodeGuess: r.decodeGuess,
      interceptGuess: r.interceptGuess,
      intercepted: r.intercepted,
      miscommunicated: r.miscommunicated,
    };
  }
  for (let i = view.roundSummaries.length - 1; i >= 0; i--) {
    const summary = view.roundSummaries[i];
    if (!summary || (summary.round === view.round && view.transmissions.length > 0)) continue;
    const last = summary.transmissions[summary.transmissions.length - 1];
    if (last) return { round: summary.round, ...last };
  }
  return null;
}

/** An operator's lamp and one-line activity in the current phase. */
export function seatActivity(
  view: DecryptoPlayerView,
  seat: number,
): { lamp: LampState; text: string } {
  const s = view.seats.find((x) => x.seat === seat);
  const me = seat === view.seat;
  if (!s || view.phase === "gameOver") return { lamp: "off", text: "" };
  if (view.phase === "clueWriting") {
    const tx = view.transmissions.find((t) => t.encryptor === seat);
    if (!tx) return { lamp: "off", text: "Standing by" };
    if (tx.clues || tx.skipped) return { lamp: "done", text: "Clues sent" };
    return { lamp: "work", text: me ? "Your clues" : "Writing clues…" };
  }
  if (view.phase === "guessing") {
    const t = view.transmissions[view.txIdx];
    if (!t) return { lamp: "off", text: "" };
    if (t.encryptor === seat) return { lamp: "off", text: "Listening" };
    if (s.team === t.team) {
      if (t.decodeCommitted) return { lamp: "done", text: "Decode locked" };
      return { lamp: "work", text: me ? "Your call" : "Decoding…" };
    }
    if (!t.interceptRequired) return { lamp: "off", text: "No intercept in round 1" };
    if (t.interceptCommitted) return { lamp: "done", text: "Intercept locked" };
    return { lamp: "work", text: me ? "Your call" : "Intercepting…" };
  }
  if (view.phase === "reveal") return { lamp: "off", text: "Watching the reveal" };
  return { lamp: "off", text: "Round closing" };
}

/** Rounds whose tape lines are still blank (reserved), from the next unrevealed round. */
export function firstBlankRound(view: DecryptoPlayerView): number {
  if (view.phase === "gameOver") return view.maxRounds + 1;
  const revealed = view.roundSummaries.some((r) => r.round === view.round);
  return revealed ? view.round + 1 : Math.max(1, view.round);
}

/** "White", "Black", or the interceptor variant's names. */
export function teamName(view: DecryptoPlayerView, team: Team): string {
  return teamLabel(view.variant, team);
}
