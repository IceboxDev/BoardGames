import { canonicalDecryptoModel } from "@boardgames/core/games/decrypto/ai/models";
import type { ClueNote, GuessNote } from "@boardgames/core/games/decrypto/notes";
import type {
  Code,
  DecryptoPlayerView,
  RoundSummaryView,
  Team,
} from "@boardgames/core/games/decrypto/types";
import { operatorName, teamName, tierName } from "./desk";

// The debrief's "Behind the lines": every transmission of the game as the
// encryptor meant it and as both sides read it, from the AI notes the game
// keeps (they reach the view only once the game is over). Pure, no React.

type Summary = RoundSummaryView["transmissions"][number];

/** Who played a role: a person (no note), or an AI tier. */
export interface Actor {
  name: string;
  /** The AI tier's id, or null for a person. */
  tier: string | null;
}

export interface ReviewRow {
  clue: string;
  digit: number;
  keyword: string | null;
  link: string | null;
  cover: string | null;
  decodedAs: number | null;
  interceptedAs: number | null;
}

export interface ReviewRead {
  actor: Actor;
  code: Code | null;
  /** Digits that matched the true code (0–3). */
  hits: number;
  exact: boolean;
  note: GuessNote | null;
  /** Intercepts: what the reader took each column to mean beside the real keyword. */
  columns: { digit: number; guess: string; keyword: string | null }[];
}

export interface ReviewTx {
  key: string;
  round: number;
  team: Team;
  teamName: string;
  code: Code;
  clues: [string, string, string] | null;
  skipped: boolean;
  encryptor: Actor;
  note: ClueNote | null;
  rows: ReviewRow[];
  decode: ReviewRead;
  /** Null in round 1 and whenever nobody was asked to intercept. */
  intercept: ReviewRead | null;
  intercepted: boolean;
  miscommunicated: boolean;
}

export interface ReviewRound {
  round: number;
  transmissions: ReviewTx[];
}

function seatTier(view: DecryptoPlayerView, seat: number): string | null {
  const s = view.seats.find((x) => x.seat === seat);
  return s?.isAi ? canonicalDecryptoModel(s.model ?? "") : null;
}

/** The seats of `team` other than `except`: an AI tier when they are all one tier, else a person. */
function teamActor(
  view: DecryptoPlayerView,
  team: Team,
  names: readonly (string | null)[],
  except: number | null,
): Actor {
  const seats = view.seats.filter((s) => s.team === team && s.seat !== except);
  const human = seats.find((s) => !s.isAi);
  if (human) return { name: operatorName(view, human.seat, names), tier: null };
  const first = seats[0];
  if (!first) return { name: teamName(view, team), tier: null };
  const tier = seatTier(view, first.seat);
  return { name: tierName(first.model), tier };
}

function read(
  actor: Actor,
  code: Code | null,
  truth: Code,
  note: GuessNote | null,
  keywords: readonly string[] | null,
): ReviewRead {
  const hits = code ? code.filter((d, i) => d === truth[i]).length : 0;
  const columns =
    note?.purpose === "intercept" && note.columns
      ? note.columns.flatMap((guess, i) =>
          guess ? [{ digit: i + 1, guess, keyword: keywords?.[i] ?? null }] : [],
        )
      : [];
  return { actor, code, hits, exact: hits === 3, note, columns };
}

function reviewTx(
  view: DecryptoPlayerView,
  round: number,
  t: Summary,
  names: readonly (string | null)[],
): ReviewTx {
  const keywords = view.result?.keywords[t.team] ?? null;
  const rival: Team = t.team === 0 ? 1 : 0;
  const encTier = seatTier(view, t.encryptor);
  const encryptor: Actor = {
    name: encTier ? tierName(encTier) : operatorName(view, t.encryptor, names),
    tier: encTier,
  };
  const rows: ReviewRow[] = (t.clues ?? []).map((clue, i) => {
    const digit = t.code[i] ?? 1;
    return {
      clue,
      digit,
      keyword: keywords?.[digit - 1] ?? null,
      link: t.encryptNote?.clues[i]?.link ?? null,
      cover: t.encryptNote?.clues[i]?.cover ?? null,
      decodedAs: t.decodeGuess?.[i] ?? null,
      interceptedAs: t.interceptGuess?.[i] ?? null,
    };
  });
  const decoder = teamActor(view, t.team, names, t.encryptor);
  const asked = t.interceptGuess !== null || t.interceptNote !== null;
  return {
    key: `${round}-${t.team}`,
    round,
    team: t.team,
    teamName: teamName(view, t.team),
    code: t.code,
    clues: t.clues,
    skipped: t.skipped,
    encryptor,
    note: t.encryptNote,
    rows,
    decode: read(decoder, t.decodeGuess, t.code, t.decodeNote, keywords),
    intercept: asked
      ? read(
          teamActor(view, rival, names, null),
          t.interceptGuess,
          t.code,
          t.interceptNote,
          keywords,
        )
      : null,
    intercepted: t.intercepted,
    miscommunicated: t.miscommunicated,
  };
}

/** Every round of the game, transmissions in White-then-Black order. */
export function reviewRounds(
  view: DecryptoPlayerView,
  names: readonly (string | null)[] = [],
): ReviewRound[] {
  return view.roundSummaries.map((r) => ({
    round: r.round,
    transmissions: [...r.transmissions]
      .sort((a, b) => a.team - b.team)
      .map((t) => reviewTx(view, r.round, t, names)),
  }));
}

/** How each AI tier at the table decides, in a line each — the debrief's legend. */
export const TIER_LOGIC: Record<string, { clues: string; guesses: string }> = {
  "decrypto-medium": {
    clues: "One call: picks an angle per keyword and checks it against the public table.",
    guesses: "One call: scores every clue against every column, then resolves the three together.",
  },
  "decrypto-hard": {
    clues:
      "One call on the strongest model: picks a fresh angle per keyword and tests what an outsider would read from the table.",
    guesses:
      "One call on the strongest model: scores every clue against every column, then resolves by elimination.",
  },
  "decrypto-expert": {
    clues:
      "Searches: four brainstorms offer up to eight clues per keyword; readers playing its teammate and its rival score each one; every combination is priced by the score; the best three are played out on the real teammate and rival before it picks.",
    guesses:
      "Five proposals — three probability tables, their average and two careful reads — then one high-effort call weighs them against the table and picks.",
  },
};

export interface TierLine {
  tier: string;
  name: string;
  clues: string;
  guesses: string;
  /** This game: transmissions sent, decoded by its team, intercepted by the rival. */
  sent: number;
  decoded: number;
  leaked: number;
  /** This game: rival transmissions it tried to intercept, and broke. */
  tried: number;
  broke: number;
}

/** One line per AI tier at the table, with how it fared this game. */
export function tierLines(rounds: readonly ReviewRound[], view: DecryptoPlayerView): TierLine[] {
  const tiers = [
    ...new Set(view.seats.filter((s) => s.isAi).map((s) => canonicalDecryptoModel(s.model ?? ""))),
  ];
  return tiers.flatMap((tier) => {
    const logic = TIER_LOGIC[tier];
    if (!logic) return [];
    const line: TierLine = {
      tier,
      name: tierName(tier),
      ...logic,
      sent: 0,
      decoded: 0,
      leaked: 0,
      tried: 0,
      broke: 0,
    };
    for (const r of rounds) {
      for (const t of r.transmissions) {
        if (t.encryptor.tier === tier && t.clues) {
          line.sent++;
          if (t.decode.exact) line.decoded++;
          if (t.intercepted) line.leaked++;
        }
        if (t.intercept?.actor.tier === tier && t.intercept.code) {
          line.tried++;
          if (t.intercept.exact) line.broke++;
        }
      }
    }
    return [line];
  });
}

/** "62%" for a 0–1 chance. */
export function pct(x: number): string {
  return `${Math.round(100 * x)}%`;
}

/** Where each candidate code came from, in words. */
export const SOURCE_LABEL: Record<GuessNote["candidates"][number]["from"], string> = {
  table: "a table",
  average: "tables' average",
  "one-call": "a careful read",
  verdict: "the verdict",
};
