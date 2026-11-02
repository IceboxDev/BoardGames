// A campaign's sessions, for the campaign night's thread: every locked night
// that is (or will be) a night of this campaign game, in order, each with its
// party and the matches recorded on it. Derived entirely from what the client
// already has — the calendar locks (each night's sealed vote winner or fixed
// game) and the game's match history — so the thread can never disagree with
// the calendar's campaign-night look.

import type { MatchRecord } from "@boardgames/core/history/types";
import { campaignNightFor } from "@boardgames/core/ical/campaign";
import { type CalendarLocks, nightDate } from "@boardgames/core/protocol";
import { variantConfigForSlug } from "../../games/match-variants";

export type SessionWhen = "past" | "tonight" | "upcoming";

export type CampaignSession = {
  nightKey: string;
  /** 1-based session number across the whole campaign. */
  n: number;
  when: SessionWhen;
  hostName: string | null;
  eventTime: string | null;
  /** Who is (or was) at the table, in RSVP order. */
  partyIds: string[];
  /** Matches of this game recorded on the night, in play order. */
  matches: MatchRecord[];
};

/** True when the night is a night of `slug`'s campaign. */
function isCampaignNightOf(slug: string, lock: CalendarLocks[string]): boolean {
  if (lock.redacted) return false;
  return campaignNightFor(lock.picksLockedAt, lock.topGameSlug)?.slug === slug;
}

function partyOf(lock: CalendarLocks[string]): string[] {
  if (lock.isPrivate && lock.seatedUserIds.length > 0) return lock.seatedUserIds;
  return Object.entries(lock.rsvps)
    .filter(([, status]) => status === "yes")
    .map(([id]) => id);
}

export function campaignSessions(
  slug: string,
  locks: CalendarLocks,
  currentKey: string,
  matches: readonly MatchRecord[],
): CampaignSession[] {
  const keys = Object.keys(locks).filter(
    (k) => k === currentKey || isCampaignNightOf(slug, locks[k]),
  );
  // Night keys sort as dates; a second night ("…_2") follows its first.
  keys.sort();
  return keys.map((k, i) => {
    const lock = locks[k];
    return {
      nightKey: k,
      n: i + 1,
      when: k === currentKey ? "tonight" : k < currentKey ? "past" : "upcoming",
      hostName: lock.host?.name ?? null,
      eventTime: lock.eventTime ?? null,
      partyIds: partyOf(lock),
      matches: matches
        .filter((m) => m.dateKey === k && m.gameSlug === slug)
        // sortOrder runs newest first (a new match takes the lowest), so play
        // order is the reverse.
        .sort((a, b) => b.sortOrder - a.sortOrder || a.playedAt.localeCompare(b.playedAt)),
    };
  });
}

// ── Missions ──────────────────────────────────────────────────────────

export type Mission = { n: number; label: string };

/**
 * The game's numbered missions, when its match-history picker numbers them
 * ("#4 Training: First Day in the Field" → { n: 4, label: "Training: …" }).
 * Empty for games without numbered missions (D&D, most campaigns today).
 */
export function missionsOf(slug: string): Mission[] {
  const options = variantConfigForSlug(slug)?.options ?? [];
  const out: Mission[] = [];
  for (const o of options) {
    const m = /^#(\d+)\s+(.*)$/.exec(o.value);
    if (!m) return [];
    out.push({ n: Number(m[1]), label: m[2] });
  }
  return out;
}

/** The mission number a match was played on, from its stored scenario. */
export function missionOfMatch(m: MatchRecord): number | null {
  const scenario = m.outcome.kind === "one-vs-many" ? undefined : m.outcome.scenario;
  const hit = scenario ? /^#(\d+)\b/.exec(scenario) : null;
  return hit ? Number(hit[1]) : null;
}

// ── One chip per match ────────────────────────────────────────────────

export type MatchChip = { label: string; tone: "won" | "lost" | "neutral"; title: string };

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * A match in one chip: "#3 ✓" for a mission won, "#3 ✗" lost; otherwise the
 * result (a co-op's Won/Lost or score, a competitive match's winner).
 */
export function matchChip(m: MatchRecord): MatchChip {
  const mission = missionOfMatch(m);
  const o = m.outcome;
  const scenario = o.kind === "one-vs-many" ? undefined : o.scenario;
  const prefix = mission !== null ? `#${mission} ` : "";
  const title = [m.gameTitle, scenario].filter(Boolean).join(" · ");
  if (o.kind === "coop") {
    if (o.outcome === "win") return { label: `${prefix}✓`, tone: "won", title: `${title} — won` };
    if (o.outcome === "loss")
      return { label: `${prefix}✗`, tone: "lost", title: `${title} — lost` };
    if (o.score !== undefined) return { label: `${prefix}${o.score}`, tone: "neutral", title };
    return { label: prefix.trim() || "Played", tone: "neutral", title };
  }
  if (o.kind === "free-for-all") {
    const winner =
      o.players.find((p) => p.rank === 1) ?? [...o.players].sort((a, b) => b.score - a.score)[0];
    return {
      label: `${prefix}${winner ? firstName(winner.displayName) : "Played"}`,
      tone: "neutral",
      title,
    };
  }
  if (o.kind === "teams") {
    const won = o.winnerTeamIndices.map((i) => o.teams[i]).filter(Boolean);
    const lead = won[0]?.members[0];
    return {
      label: `${prefix}${lead ? `${firstName(lead.displayName)}'s team` : "Played"}`,
      tone: "neutral",
      title,
    };
  }
  return { label: prefix.trim() || "Played", tone: "neutral", title };
}

// ── The summary line under the campaign's name ────────────────────────

/** Missions cleared so far: distinct numbered missions with a won match. */
export function clearedMissions(sessions: readonly CampaignSession[]): Set<number> {
  const out = new Set<number>();
  for (const s of sessions) {
    if (s.when === "upcoming") continue;
    for (const m of s.matches) {
      const n = missionOfMatch(m);
      if (n !== null && m.outcome.kind === "coop" && m.outcome.outcome === "win") out.add(n);
    }
  }
  return out;
}

export function summaryLine(
  slug: string,
  sessions: readonly CampaignSession[],
  formatDay: (key: string) => string,
): string {
  const tonight = sessions.find((s) => s.when === "tonight");
  const first = sessions[0];
  if (!tonight || !first) return "";
  if (first === tonight) return `Session ${tonight.n} — the campaign starts tonight`;
  const missions = missionsOf(slug);
  const since = `since ${formatDay(nightDate(first.nightKey))}`;
  if (missions.length > 0) {
    const cleared = clearedMissions(sessions).size;
    return `Session ${tonight.n} · ${cleared} of ${missions.length} missions cleared · ${since}`;
  }
  const logged = sessions
    .filter((s) => s.when !== "upcoming")
    .reduce((n, s) => n + s.matches.length, 0);
  return `Session ${tonight.n} · ${logged} ${logged === 1 ? "match" : "matches"} logged · ${since}`;
}

/** The next mission not yet cleared, when the game numbers its missions. */
export function nextMission(slug: string, sessions: readonly CampaignSession[]): Mission | null {
  const missions = missionsOf(slug);
  if (missions.length === 0) return null;
  const cleared = clearedMissions(sessions);
  return missions.find((m) => !cleared.has(m.n)) ?? null;
}
