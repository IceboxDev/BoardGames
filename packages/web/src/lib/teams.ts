import { type Rng, shuffle } from "@boardgames/core/lib/rng";
import { z } from "zod";
import { defaultKindForSlug } from "../games/match-kinds";
import type { Attendee } from "./calendar-games";

// Team generator for a night's Attendees tab. Whoever taps "Make teams" holds
// their phone up to the table, and the split is kept per night in
// localStorage so closing the modal doesn't lose it.
//
// Two ways to deal: BALANCED asks the server for the fairest split for the
// chosen game (the rating engine's strengths never leave the server — the
// answer is teams + win chances), RANDOM shuffles right here, and is also
// the fallback when the server can't be reached.

/** Shuffle, then deal round-robin: sizes differ by at most one, no team is empty. */
export function dealTeams(ids: readonly string[], teamCount: number, rng?: Rng): string[][] {
  const count = Math.max(1, Math.min(teamCount, ids.length));
  const teams: string[][] = Array.from({ length: count }, () => []);
  shuffle(ids, rng).forEach((id, i) => {
    teams[i % count].push(id);
  });
  return teams;
}

/** Who the pool offers at all: invited-without-reply and declined seats are not at the table. */
export function isTeamCandidate(a: Attendee): boolean {
  return a.seat !== "invited" && a.seat !== "declined";
}

/** Confirmed people start in; maybes and the waitlist start out (tap to add). */
export function defaultInPool(a: Attendee): boolean {
  if (a.seat !== null) return a.seat === "host" || a.seat === "seated";
  return a.status === "definite";
}

/** At least two teams; at most one team per two players (a 3-player pool still gets 2). */
export function teamCountBounds(poolSize: number): { min: number; max: number } {
  return { min: 2, max: Math.max(2, Math.floor(poolSize / 2)) };
}

/** "3 + 3 + 2" — the sizes a deal of `poolSize` into `teamCount` teams produces. */
export function splitCaption(poolSize: number, teamCount: number): string {
  if (poolSize === 0) return "Nobody in the pool";
  const count = Math.min(teamCount, poolSize);
  const base = Math.floor(poolSize / count);
  const extra = poolSize % count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0)).join(" + ");
}

export type TeamsMode = "balanced" | "random";

const TeamsStateSchema = z.object({
  teamCount: z.number().int().min(1),
  /** userId → in (true) / out (false), only where it differs from `defaultInPool`. */
  overrides: z.record(z.string(), z.boolean()),
  teams: z.array(z.array(z.string())).nullable(),
  // Added with balancing; older saves parse with the defaults.
  mode: z.enum(["balanced", "random"]).default("balanced"),
  /** The game the teams are balanced for; null until one is picked. */
  slug: z.string().nullable().default(null),
  /** Win chance per team of a balanced deal (same order as `teams`). */
  chances: z.array(z.number()).nullable().default(null),
  /** Players whose strength in `slug` was a guess: "traits" (never played it) or "unknown". */
  guessed: z.record(z.string(), z.enum(["traits", "unknown"])).default({}),
});
export type TeamsState = z.infer<typeof TeamsStateSchema>;

export const DEFAULT_TEAMS_STATE: TeamsState = {
  teamCount: 2,
  overrides: {},
  teams: null,
  mode: "balanced",
  slug: null,
  chances: null,
  guessed: {},
};

const storageKey = (date: string) => `bg:teams:${date}`;

export function loadTeams(date: string): TeamsState {
  try {
    const raw = window.localStorage.getItem(storageKey(date));
    if (!raw) return DEFAULT_TEAMS_STATE;
    const parsed = TeamsStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_TEAMS_STATE;
  } catch {
    return DEFAULT_TEAMS_STATE;
  }
}

export function saveTeams(date: string, state: TeamsState): void {
  try {
    window.localStorage.setItem(storageKey(date), JSON.stringify(state));
  } catch {
    // Private window / storage full: the teams still show, they just won't survive a reload.
  }
}

/**
 * A game played in teams: recorded as a team match by default, or tagged a
 * team game on BoardGameGeek. Only a hint for the picker's ordering — any
 * game can be balanced for.
 */
export function isTeamGame(slug: string, mechanics: readonly string[]): boolean {
  return defaultKindForSlug(slug) === "teams" || mechanics.includes("Team-Based Game");
}

/** A fresh seed for the server's pick among equally fair splits. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/**
 * How even a deal is, from its win chances: the gap between the likeliest
 * and the least likely team.
 */
export function evenness(chances: readonly number[]): "even" | "close" | "uneven" {
  if (chances.length < 2) return "even";
  const gap = Math.max(...chances) - Math.min(...chances);
  return gap < 0.05 ? "even" : gap < 0.15 ? "close" : "uneven";
}
