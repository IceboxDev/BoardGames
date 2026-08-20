// What changed, and which change is worth telling the group about.
//
// The rating fit is recomputed on demand, and each run leaves the payload it
// replaced behind as a baseline. Diffing the two answers one question: who had
// the biggest good week? Everything here is deliberately RANK-based — "4th to
// 1st in Planning" lands, "θ rose by 0.17" does not — and deliberately
// one-directional: this module can only produce good news. Nobody is told
// they slipped, and nobody is named as the person who was overtaken.
//
// Pure and total: same two snapshots in, same ordered candidates out.

import type {
  GameBoard,
  PlayerSkillResponse,
  SkillTraitId,
  TraitBoard,
} from "../protocol/index.ts";

/** The comparable slice of a stored rating state. */
export type SkillSnapshot = {
  players: Readonly<Record<string, PlayerSkillResponse>>;
  traitBoards: readonly TraitBoard[];
  gameBoards: readonly GameBoard[];
  streaks: readonly { userId: string; length: number }[];
};

export type SpotlightEvent =
  | { kind: "trait-climb"; trait: SkillTraitId; from: number | null; to: number; fieldSize: number }
  | { kind: "game-climb"; slug: string; from: number | null; to: number; fieldSize: number }
  | { kind: "profile-unlocked"; ratedMatches: number; distinctGames: number }
  | { kind: "streak-lead"; length: number };

export type SpotlightCandidate = {
  /** Stable across re-derivation, so the admin can publish one by name. */
  key: string;
  subjectUserId: string;
  event: SpotlightEvent;
  score: number;
};

/**
 * Every tunable in one place. The shape of the formula matters more than the
 * constants: a climb is worth the fraction of the field it passed, plus a
 * large bonus for actually reaching the top, plus a small nod to raw distance.
 */
export const SPOTLIGHT_WEIGHTS = {
  /**
   * Reaching the top is the story people actually tell, so it outweighs the
   * field term outright: "the new one to beat at Wingspan" beats "climbed five
   * places to 3rd", which is not what a pure places-passed score produced.
   */
  crownBonus: 80,
  podiumBonus: 25,
  depthPerPlace: 4,
  depthCap: 15,
  /** Per-game boards are narrower news than the group-wide trait boards. */
  gameBoardMultiplier: 0.85,
  /**
   * Arriving on a board for the first time counts as passing everyone below
   * it, which flatters: those members were never ahead, they simply weren't
   * ranked yet. Real news, discounted against overtaking named people.
   */
  entryMultiplier: 0.6,
  profileUnlocked: 90,
  streakBase: 70,
  streakPerLength: 5,
  streakLengthCap: 6,
  /** Below this a "run" is just two good games. */
  minStreakLength: 3,
} as const;

const KIND_ORDER: Record<SpotlightEvent["kind"], number> = {
  "trait-climb": 0,
  "game-climb": 1,
  "profile-unlocked": 2,
  "streak-lead": 3,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A climb's worth: field passed + reaching the top + raw distance. */
function climbScore(
  from: number | null,
  to: number,
  fieldSize: number,
  multiplier: number,
): number {
  const places = placesGained(from, to, fieldSize);
  const field = Math.min(100, (100 * places) / Math.max(1, fieldSize - 1));
  const crown =
    to === 1 ? SPOTLIGHT_WEIGHTS.crownBonus : to <= 3 ? SPOTLIGHT_WEIGHTS.podiumBonus : 0;
  const depth = Math.min(SPOTLIGHT_WEIGHTS.depthCap, SPOTLIGHT_WEIGHTS.depthPerPlace * places);
  const entry = from === null ? SPOTLIGHT_WEIGHTS.entryMultiplier : 1;
  return round2((field + crown + depth) * multiplier * entry);
}

/** Places gained, treating "wasn't on the board" as one place past the end. */
function placesGained(from: number | null, to: number, fieldSize: number): number {
  return (from ?? fieldSize + 1) - to;
}

function ratedMatchesOf(snapshot: SkillSnapshot, userId: string): number {
  return snapshot.players[userId]?.eligibility.ratedMatches ?? 0;
}

function isEligible(snapshot: SkillSnapshot, userId: string): boolean {
  return snapshot.players[userId]?.eligibility.eligible === true;
}

/**
 * The sole holder of the longest live win run, or null when there isn't one —
 * nobody is running, the run is too short to be a story, or it is shared.
 * A tie has no "the one to beat", so it stays unannounced.
 */
function soleStreakLeader(snapshot: SkillSnapshot): { userId: string; length: number } | null {
  const [lead, runnerUp] = snapshot.streaks;
  if (!lead || lead.length < SPOTLIGHT_WEIGHTS.minStreakLength) return null;
  return runnerUp && runnerUp.length === lead.length ? null : lead;
}

/**
 * Everything worth celebrating between two runs, best first.
 *
 * Returns nothing without a comparable baseline: a first-ever run, or one
 * across an engine change, has no honest "before".
 */
export function spotlightCandidates(
  prev: SkillSnapshot | null,
  next: SkillSnapshot,
): SpotlightCandidate[] {
  if (!prev) return [];
  const out: SpotlightCandidate[] = [];

  // ── Profiles that unlocked ───────────────────────────────────────────
  // Collected first: for a newly ranked member, entering six trait boards at
  // once IS the unlock, so those climbs are suppressed below rather than
  // burying the real story under its own side effects.
  const unlocked = new Set<string>();
  for (const [userId, player] of Object.entries(next.players)) {
    if (!player.eligibility.eligible || isEligible(prev, userId)) continue;
    unlocked.add(userId);
    out.push({
      key: `profile-unlocked:${userId}`,
      subjectUserId: userId,
      event: {
        kind: "profile-unlocked",
        ratedMatches: player.eligibility.ratedMatches,
        distinctGames: player.eligibility.distinctGames,
      },
      score: SPOTLIGHT_WEIGHTS.profileUnlocked,
    });
  }

  // ── Trait-board climbs ───────────────────────────────────────────────
  for (const board of next.traitBoards) {
    // A board that didn't render before makes everyone a "new entrant"; that
    // is the board unlocking, not eight people climbing.
    const before = prev.traitBoards.find((b) => b.trait === board.trait);
    if (!before) continue;
    for (const entry of board.entries) {
      if (unlocked.has(entry.userId)) continue;
      const from = before.entries.find((e) => e.userId === entry.userId)?.rank ?? null;
      if (from !== null && from <= entry.rank) continue;
      // Earned it: passive movement (someone above dropped off the board)
      // is not an achievement.
      if (ratedMatchesOf(next, entry.userId) <= ratedMatchesOf(prev, entry.userId)) continue;
      out.push({
        key: `trait-climb:${board.trait}:${entry.userId}`,
        subjectUserId: entry.userId,
        event: {
          kind: "trait-climb",
          trait: board.trait,
          from,
          to: entry.rank,
          fieldSize: board.entries.length,
        },
        score: climbScore(from, entry.rank, board.entries.length, 1),
      });
    }
  }

  // ── Per-game board climbs ────────────────────────────────────────────
  for (const board of next.gameBoards) {
    const before = prev.gameBoards.find((b) => b.slug === board.slug);
    if (!before) continue;
    for (const entry of board.entries) {
      if (unlocked.has(entry.userId)) continue;
      const previous = before.entries.find((e) => e.userId === entry.userId);
      if (previous && previous.rank <= entry.rank) continue;
      // Earned it: they actually played this game since the last run.
      if (entry.matches <= (previous?.matches ?? 0)) continue;
      out.push({
        key: `game-climb:${board.slug}:${entry.userId}`,
        subjectUserId: entry.userId,
        event: {
          kind: "game-climb",
          slug: board.slug,
          from: previous?.rank ?? null,
          to: entry.rank,
          fieldSize: board.entries.length,
        },
        score: climbScore(
          previous?.rank ?? null,
          entry.rank,
          board.entries.length,
          SPOTLIGHT_WEIGHTS.gameBoardMultiplier,
        ),
      });
    }
  }

  // ── A new holder of the longest live win run ─────────────────────────
  const lead = soleStreakLeader(next);
  if (lead && lead.userId !== soleStreakLeader(prev)?.userId && next.players[lead.userId]) {
    out.push({
      key: `streak-lead:${lead.userId}`,
      subjectUserId: lead.userId,
      event: { kind: "streak-lead", length: lead.length },
      score:
        SPOTLIGHT_WEIGHTS.streakBase +
        SPOTLIGHT_WEIGHTS.streakPerLength *
          Math.min(lead.length, SPOTLIGHT_WEIGHTS.streakLengthCap),
    });
  }

  return out.sort(compareCandidates);
}

function climbFacts(event: SpotlightEvent): { places: number; to: number } {
  if (event.kind === "trait-climb" || event.kind === "game-climb") {
    return { places: placesGained(event.from, event.to, event.fieldSize), to: event.to };
  }
  return { places: 0, to: Number.MAX_SAFE_INTEGER };
}

/** Total order — no ties, so two runs over the same data agree exactly. */
function compareCandidates(a: SpotlightCandidate, b: SpotlightCandidate): number {
  if (b.score !== a.score) return b.score - a.score;
  const fa = climbFacts(a.event);
  const fb = climbFacts(b.event);
  if (fb.places !== fa.places) return fb.places - fa.places;
  if (fa.to !== fb.to) return fa.to - fb.to;
  const ka = KIND_ORDER[a.event.kind];
  const kb = KIND_ORDER[b.event.kind];
  if (ka !== kb) return ka - kb;
  return a.key < b.key ? -1 : 1;
}

export type Spotlight = {
  headline: SpotlightCandidate;
  /** At most two, each about a different person than the headline. */
  runnersUp: SpotlightCandidate[];
};

/**
 * The headline plus up to two supporting mentions. One person can only appear
 * once — three cards about the same good week reads as a slideshow, not news.
 */
export function pickSpotlight(candidates: readonly SpotlightCandidate[]): Spotlight | null {
  const [headline] = candidates;
  if (!headline) return null;
  const seen = new Set([headline.subjectUserId]);
  const runnersUp: SpotlightCandidate[] = [];
  for (const candidate of candidates.slice(1)) {
    if (runnersUp.length === 2) break;
    if (seen.has(candidate.subjectUserId)) continue;
    seen.add(candidate.subjectUserId);
    runnersUp.push(candidate);
  }
  return { headline, runnersUp };
}
