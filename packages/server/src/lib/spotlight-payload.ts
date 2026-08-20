// Pure shaping for spotlight greetings: what moved, and what one published
// card freezes. Deliberately free of db/auth imports so it can be unit-tested
// without a database connection (same split as `skill-payload.ts`).

import {
  type Greeting,
  type SpotlightCandidate,
  SpotlightCandidateSchema,
  type SpotlightEvent,
  type SpotlightPayload,
  SpotlightPayloadSchema,
} from "@boardgames/core/protocol";
import {
  spotlightCandidates as diffSnapshots,
  pickSpotlight,
  type SkillSnapshot,
} from "@boardgames/core/skill/greetings";
import type { SkillRatingStatus, StoredSkillState } from "./skill-ratings.ts";

/** The comparable slice of a stored state — what the pure differ consumes. */
function snapshotOf(state: StoredSkillState): SkillSnapshot {
  return {
    players: state.players,
    traitBoards: state.leaderboards.traits,
    gameBoards: state.leaderboards.games,
    streaks: state.streaks,
  };
}

/** What this recompute changed, best first. Empty without a baseline. */
export function candidatesFor(status: SkillRatingStatus): SpotlightCandidate[] {
  if (!status.state || !status.baseline) return [];
  return diffSnapshots(snapshotOf(status.baseline), snapshotOf(status.state)).map((c) =>
    SpotlightCandidateSchema.parse(c),
  );
}

/**
 * The board rows a spotlight card shows as its receipt: the top three plus the
 * subject's own row when they finished outside it. Values are frozen as
 * rendered — this is a snapshot, not a live query.
 */
function proofFor(
  state: StoredSkillState,
  subjectUserId: string,
  event: SpotlightEvent,
): SpotlightPayload["proof"] {
  const entries =
    event.kind === "trait-climb"
      ? state.leaderboards.traits
          .find((b) => b.trait === event.trait)
          ?.entries.map((e) => ({ userId: e.userId, rank: e.rank, value: String(e.score) }))
      : event.kind === "game-climb"
        ? state.leaderboards.games
            .find((b) => b.slug === event.slug)
            ?.entries.map((e) => ({ userId: e.userId, rank: e.rank, value: `${e.matches}×` }))
        : undefined;
  if (!entries || entries.length === 0) return null;
  const rows = entries.slice(0, 3);
  const own = entries.find((e) => e.userId === subjectUserId);
  if (own && !rows.some((r) => r.userId === subjectUserId)) rows.push(own);
  return { rows };
}

/** Freeze a ranked candidate list into the payload one card will carry. */
export function payloadFor(
  state: StoredSkillState,
  candidates: readonly SpotlightCandidate[],
  candidateKey: string,
): { subjectUserId: string; payload: SpotlightPayload } | null {
  const headlineIndex = candidates.findIndex((c) => c.key === candidateKey);
  if (headlineIndex === -1) return null;
  // Re-pick from the chosen candidate onward so the runner-up rule (one
  // mention per person) still holds when the admin overrides the ranking.
  const picked = pickSpotlight([
    candidates[headlineIndex],
    ...candidates.filter((_, i) => i !== headlineIndex),
  ]);
  if (!picked) return null;
  return {
    subjectUserId: picked.headline.subjectUserId,
    payload: SpotlightPayloadSchema.parse({
      event: picked.headline.event,
      runnersUp: picked.runnersUp.map((r) => ({ userId: r.subjectUserId, event: r.event })),
      proof: proofFor(state, picked.headline.subjectUserId, picked.headline.event),
    }),
  };
}

/** Every userId a greeting references, for the name/avatar side-car. */
export function greetingUserIds(greeting: Greeting | null): Set<string> {
  const ids = new Set<string>();
  if (greeting?.kind !== "spotlight") return ids;
  ids.add(greeting.subjectUserId);
  for (const r of greeting.payload.runnersUp) ids.add(r.userId);
  for (const r of greeting.payload.proof?.rows ?? []) ids.add(r.userId);
  return ids;
}
