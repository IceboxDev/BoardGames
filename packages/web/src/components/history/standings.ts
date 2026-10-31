// The one reading of a match's result that the history row's phone summary
// and its expanded standings share: who leads (the winner, the winning team,
// or a result badge), a short preview of the rest ("AG 47 · BA 46 · +3") and
// the full standings, grouped by team where there are teams. The desktop row
// keeps the per-kind inline renderers in MatchCard; this model is what a
// phone shows, where a wrapping row of bubbles doesn't fit.

import { awardLabel } from "@boardgames/core/history/awards";
import { ffaRankStanding } from "@boardgames/core/history/participant-results";
import { TRIVIAL_PURSUIT_SLUG } from "@boardgames/core/history/trivial-pursuit";
import type {
  MatchOutcome,
  MatchOutcomeCoop,
  MatchOutcomeFreeForAll,
  MatchOutcomeLastStanding,
  MatchOutcomeOneVsMany,
  MatchOutcomeTeams,
} from "@boardgames/core/history/types";
import {
  coopMaxScoreForSlug,
  isPointlessFreeForAll,
  lowScoreWinsForSlug,
} from "../../games/score-config";
import { teamConfigForSlug } from "../../games/team-config";
import { initialsFromName } from "../../lib/names.ts";
import { conditionMeta, isDndSlug, resolutionOf } from "./dnd";
import {
  describeSensoTiebreak,
  isSensoSlug,
  sensoFfaStandings,
  sensoTeamsStandings,
} from "./forms/senso-standings";

export type StandingTone = "winner" | "loser" | "neutral";

export type StandingRow = {
  userId: string;
  name: string;
  /** 1-based finishing place, when the result orders players. */
  place?: number;
  /** The player's number (score, wedges), when the game has one. */
  value?: string;
  /** The number alone where `value` carries a unit ("5" for "5 wedges"), for tight spots. */
  shortValue?: string;
  /** Role, award, hands, condition… — shown as small notes beside the name. */
  notes: string[];
  tone: StandingTone;
};

export type StandingGroup = { label?: string; rows: StandingRow[] };

export type ResultTone = "emerald" | "rose" | "amber" | "sky" | "neutral";

export type MatchLead =
  /** The winner (or the winning team, as a stack), with their number if any. */
  | { kind: "players"; rows: StandingRow[]; value?: string }
  /** A result with no single winner: a co-op's Won/Lost/score, or a draw. */
  | { kind: "badge"; text: string; tone: ResultTone };

export type PreviewEntry = { text: string; userId: string };

export type MatchStandings = {
  lead: MatchLead;
  /** Up to three players after the lead, e.g. "AG 47". */
  preview: PreviewEntry[];
  /** Word before the preview ("beat", "then"), when the bare list would mislead. */
  previewLead?: string;
  /** Players left out of the preview. */
  more: number;
  groups: StandingGroup[];
};

const PREVIEW_SIZE = 3;

function preview(
  rows: StandingRow[],
  withValue: boolean,
): Pick<MatchStandings, "preview" | "more"> {
  const shown = rows.slice(0, PREVIEW_SIZE);
  return {
    preview: shown.map((r) => ({
      userId: r.userId,
      text:
        withValue && r.value
          ? `${initialsFromName(r.name)} ${r.shortValue ?? r.value}`
          : initialsFromName(r.name),
    })),
    more: Math.max(0, rows.length - shown.length),
  };
}

export function matchStandings(outcome: MatchOutcome, gameSlug: string | null): MatchStandings {
  switch (outcome.kind) {
    case "free-for-all":
      return freeForAllStandings(outcome, gameSlug);
    case "teams":
      return teamsStandings(outcome, gameSlug);
    case "last-standing":
      return lastStandingStandings(outcome, gameSlug);
    case "coop":
      return coopStandings(outcome, gameSlug);
    case "one-vs-many":
      return oneVsManyStandings(outcome);
  }
}

// ── Free-for-all ──────────────────────────────────────────────────────

function freeForAllStandings(
  outcome: MatchOutcomeFreeForAll,
  gameSlug: string | null,
): MatchStandings {
  type P = MatchOutcomeFreeForAll["players"][number];
  const notesOf = (p: P): string[] => {
    const notes: string[] = [];
    if (p.role) notes.push(p.role);
    if (p.roundScores) notes.push(`Rounds ${p.roundScores.join(" · ")}`);
    if (p.raceRounds) notes.push(`Hands ${p.raceRounds.join(" + ")}`);
    for (const id of p.awards ?? []) notes.push(awardLabel(gameSlug, id));
    return notes;
  };

  if (outcome.draw) {
    const rows = outcome.players.map((p) => ({
      userId: p.userId,
      name: p.displayName,
      notes: notesOf(p),
      tone: "neutral" as const,
    }));
    return {
      lead: { kind: "badge", text: "Draw", tone: "neutral" },
      ...preview(rows, false),
      groups: [{ rows }],
    };
  }

  const isTrivialPursuit = gameSlug === TRIVIAL_PURSUIT_SLUG;
  if (isPointlessFreeForAll(gameSlug) || isTrivialPursuit) {
    // Same order and winner rule as the desktop's point-less renderer.
    const hasRank = outcome.players.some((p) => p.rank === 1);
    const top = Math.max(...outcome.players.map((p) => p.score));
    const isWinner = (p: P) => (hasRank ? p.rank === 1 : p.score === top);
    const standing = ffaRankStanding(outcome);
    const sorted = [...outcome.players].sort(
      (a, b) =>
        Number(!isWinner(a)) - Number(!isWinner(b)) ||
        standing(a) - standing(b) ||
        a.displayName.localeCompare(b.displayName),
    );
    const rows: StandingRow[] = sorted.map((p, i) => ({
      userId: p.userId,
      name: p.displayName,
      place: isTrivialPursuit || hasRank ? i + 1 : undefined,
      value: p.wedges
        ? `${p.wedges.length} ${p.wedges.length === 1 ? "wedge" : "wedges"}`
        : undefined,
      shortValue: p.wedges ? String(p.wedges.length) : undefined,
      notes: notesOf(p),
      tone: isWinner(p) ? "winner" : "loser",
    }));
    const winners = rows.filter((r) => r.tone === "winner");
    return {
      lead: {
        kind: "players",
        rows: winners,
        value: winners.length === 1 ? (winners[0].shortValue ?? winners[0].value) : undefined,
      },
      previewLead: rows.length === 2 ? "beat" : undefined,
      ...preview(rows.slice(winners.length), isTrivialPursuit),
      groups: [{ rows }],
    };
  }

  // Scored: an explicit rank (a broken tie) wins over the score order.
  const lowestWins = lowScoreWinsForSlug(gameSlug);
  const rankMode = outcome.players.some((p) => p.rank !== undefined);
  const sorted = [...outcome.players].sort((a, b) =>
    rankMode
      ? (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY)
      : lowestWins
        ? a.score - b.score
        : b.score - a.score,
  );
  const winningScore = sorted[0]?.score;
  const isWinner = (p: P) => (rankMode ? p.rank === 1 : p.score === winningScore);
  const rows: StandingRow[] = sorted.map((p, i) => ({
    userId: p.userId,
    name: p.displayName,
    // Equal scores share a place unless a recorded rank broke the tie.
    place: rankMode ? (p.rank ?? i + 1) : sorted.findIndex((q) => q.score === p.score) + 1,
    value: String(p.score),
    notes: notesOf(p),
    tone: isWinner(p) ? "winner" : "loser",
  }));
  const winners = rows.filter((r) => r.tone === "winner");
  const tiebreak = isSensoSlug(gameSlug)
    ? describeSensoTiebreak(sensoFfaStandings(outcome.players).tiebreak)
    : null;
  return {
    lead: { kind: "players", rows: winners, value: winners[0]?.value },
    ...preview(rows.slice(winners.length), true),
    groups: [{ label: tiebreak ?? undefined, rows }],
  };
}

// ── Teams ─────────────────────────────────────────────────────────────

function decryptoTokens(outcome: MatchOutcomeTeams, team: number): string | null {
  if (!outcome.decryptoRounds) return null;
  let interceptions = 0;
  let miscommunications = 0;
  for (const r of outcome.decryptoRounds) {
    if (r.interception[team as 0 | 1]) interceptions += 1;
    if (r.miscommunication[team as 0 | 1]) miscommunications += 1;
  }
  const bits: string[] = [];
  if (interceptions > 0)
    bits.push(`${interceptions} ${interceptions === 1 ? "interception" : "interceptions"}`);
  if (miscommunications > 0) {
    bits.push(
      `${miscommunications} ${miscommunications === 1 ? "miscommunication" : "miscommunications"}`,
    );
  }
  return bits.length > 0 ? bits.join(", ") : null;
}

function teamsStandings(outcome: MatchOutcomeTeams, gameSlug: string | null): MatchStandings {
  const winners = new Set(outcome.winnerTeamIndices);
  const decided = winners.size > 0;
  // A lead-seat game fills everyone else in with the fallback role (Codenames:
  // "Operative") — only the lead seat is worth naming on each row.
  const fallbackRole = teamConfigForSlug(gameSlug).leadRole?.fallback;
  const teams = outcome.teams.map((t, i) => {
    const won = winners.has(i);
    const bits = [decided ? (won ? "Won" : "Lost") : `Team ${i + 1}`];
    if (typeof t.score === "number") bits.push(String(t.score));
    const tokens = decryptoTokens(outcome, i);
    if (tokens) bits.push(tokens);
    if (t.wedges) bits.push(`${t.wedges.length} ${t.wedges.length === 1 ? "wedge" : "wedges"}`);
    const rows: StandingRow[] = t.members.map((m) => {
      const notes: string[] = [];
      if (m.role && m.role !== fallbackRole) notes.push(m.role);
      if (m.eliminated) notes.push("voted out");
      return {
        userId: m.userId,
        name: m.displayName,
        notes,
        tone: decided ? (won ? "winner" : "loser") : "neutral",
      };
    });
    return { won, score: t.score, group: { label: bits.join(" · "), rows } };
  });
  // Winners first, otherwise the recorded order.
  const ordered = [...teams].sort((a, b) => Number(b.won) - Number(a.won));
  const groups = ordered.map((t) => t.group);
  if (isSensoSlug(gameSlug)) {
    const rung = describeSensoTiebreak(sensoTeamsStandings(outcome.teams).tiebreak);
    if (rung && groups[0]) groups[0] = { ...groups[0], label: `${groups[0].label} · ${rung}` };
  }
  if (outcome.moderator) {
    groups.push({
      label: "Storyteller",
      rows: [
        {
          userId: outcome.moderator.userId,
          name: outcome.moderator.displayName,
          notes: outcome.moderator.role ? [outcome.moderator.role] : [],
          tone: "neutral",
        },
      ],
    });
  }
  const winning = ordered[0];
  if (!decided || !winning) {
    const everyone = groups.flatMap((g) => g.rows);
    return {
      lead: { kind: "badge", text: "No winner", tone: "neutral" },
      ...preview(everyone, false),
      groups,
    };
  }
  const losers = ordered.filter((t) => !t.won).flatMap((t) => t.group.rows);
  return {
    lead: {
      kind: "players",
      rows: winning.group.rows,
      value: typeof winning.score === "number" ? String(winning.score) : undefined,
    },
    previewLead: "beat",
    ...preview(losers, false),
    groups,
  };
}

// ── Last standing ─────────────────────────────────────────────────────

function lastStandingStandings(
  outcome: MatchOutcomeLastStanding,
  gameSlug: string | null,
): MatchStandings {
  type P = MatchOutcomeLastStanding["players"][number];
  const survivors = outcome.players
    .filter((p) => p.eliminationOrder === undefined)
    .sort(
      (a, b) =>
        (a.survivorRank ?? Number.POSITIVE_INFINITY) - (b.survivorRank ?? Number.POSITIVE_INFINITY),
    );
  const eliminated = outcome.players
    .filter((p) => p.eliminationOrder !== undefined)
    .sort((a, b) => (b.eliminationOrder ?? 0) - (a.eliminationOrder ?? 0));
  const ranks = outcome.players
    .map((p) => p.survivorRank)
    .filter((r): r is number => r !== undefined);
  const bestRank = ranks.length > 0 ? Math.min(...ranks) : undefined;
  const leads = (p: P) =>
    p.eliminationOrder === undefined &&
    (p.survivorRank === undefined || p.survivorRank === bestRank);
  const rows: StandingRow[] = [...survivors, ...eliminated].map((p, i) => {
    const notes: string[] = [];
    if (p.role) notes.push(p.role);
    if (p.survivorRank !== undefined) {
      notes.push(`#${p.survivorRank}${gameSlug === "poker" ? " in chips" : ""}`);
    } else if (p.eliminationOrder === undefined) {
      notes.push("Survived");
    }
    return {
      userId: p.userId,
      name: p.displayName,
      place: i + 1,
      notes,
      tone: leads(p) ? "winner" : "loser",
    };
  });
  const winners = rows.filter((r) => r.tone === "winner");
  return {
    lead: { kind: "players", rows: winners },
    previewLead: rows.length === 2 ? "beat" : "then",
    ...preview(rows.slice(winners.length), false),
    groups: [{ rows }],
  };
}

// ── Co-op ─────────────────────────────────────────────────────────────

function coopStandings(outcome: MatchOutcomeCoop, gameSlug: string | null): MatchStandings {
  const dnd = isDndSlug(gameSlug);
  let lead: MatchLead;
  let tone: StandingTone;
  if (dnd) {
    const resolution = resolutionOf(outcome);
    lead =
      resolution === "win"
        ? { kind: "badge", text: "Won", tone: "emerald" }
        : resolution === "loss"
          ? { kind: "badge", text: "Lost", tone: "rose" }
          : { kind: "badge", text: "Ongoing", tone: "sky" };
    tone = resolution === "win" ? "winner" : resolution === "loss" ? "loser" : "neutral";
  } else if (outcome.outcome !== undefined) {
    const won = outcome.outcome === "win";
    const margin =
      outcome.score !== undefined && outcome.opponentScore !== undefined
        ? ` ${outcome.score}–${outcome.opponentScore}`
        : "";
    lead = {
      kind: "badge",
      text: `${won ? "Won" : "Lost"}${margin}`,
      tone: won ? "emerald" : "rose",
    };
    tone = won ? "winner" : "loser";
  } else if (outcome.score !== undefined) {
    const max = coopMaxScoreForSlug(gameSlug);
    lead = {
      kind: "badge",
      text: max !== undefined ? `${outcome.score} / ${max}` : String(outcome.score),
      tone: "amber",
    };
    tone = "neutral";
  } else {
    lead = { kind: "badge", text: "Lost", tone: "rose" };
    tone = "loser";
  }
  const rows: StandingRow[] = outcome.participants.map((p) => {
    const cond = p.condition ? conditionMeta(p.condition) : null;
    return { userId: p.userId, name: p.displayName, notes: cond ? [cond.full] : [], tone };
  });
  const groups: StandingGroup[] = [{ rows }];
  if (outcome.moderator) {
    groups.push({
      label: dnd ? "Dungeon Master" : "Moderator",
      rows: [
        {
          userId: outcome.moderator.userId,
          name: outcome.moderator.displayName,
          notes: [],
          tone: "neutral",
        },
      ],
    });
  }
  return { lead, ...preview(rows, false), groups };
}

// ── One vs many ───────────────────────────────────────────────────────

function oneVsManyStandings(outcome: MatchOutcomeOneVsMany): MatchStandings {
  const soloWon = outcome.winnerSide === "solo";
  const solo: StandingRow = {
    userId: outcome.solo.userId,
    name: outcome.solo.displayName,
    notes: outcome.solo.roleLabel ? [outcome.solo.roleLabel] : [],
    tone: soloWon ? "winner" : "loser",
  };
  const team: StandingRow[] = outcome.team.members.map((m) => ({
    userId: m.userId,
    name: m.displayName,
    notes: [],
    tone: soloWon ? "loser" : "winner",
  }));
  const soloGroup = {
    label: `${soloWon ? "Won" : "Lost"} · ${outcome.solo.roleLabel ?? "Solo"}`,
    rows: [solo],
  };
  const teamGroup = {
    label: `${soloWon ? "Lost" : "Won"} · ${outcome.team.roleLabel ?? "Team"}`,
    rows: team,
  };
  return soloWon
    ? {
        lead: { kind: "players", rows: [solo] },
        previewLead: "beat",
        ...preview(team, false),
        groups: [soloGroup, teamGroup],
      }
    : {
        lead: { kind: "players", rows: team },
        previewLead: "beat",
        ...preview([solo], false),
        groups: [teamGroup, soloGroup],
      };
}
