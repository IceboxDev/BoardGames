/**
 * Team odds and recommendations. Every legal team (≤ 252) is scored against
 * every world (≤ 210) — exhaustive, no heuristics.
 */

import { combinations, failsNeeded, maskOf, popcount, teamSize } from "../rules";
import { type ModelEnv, type Situation, spyFailChance } from "./model";
import type { Analysis, Snapshot } from "./posterior";

export interface TeamOdds {
  team: number[];
  mission: number;
  /** P(no spy aboard). */
  pClean: number;
  /** P(the mission succeeds), spies failing by the model. */
  pSuccess: number;
}

/** P(fewer than `needed` of `spies` independent spies fail). */
export function successChance(spies: number, needed: number, chance: number): number {
  let p = 0;
  let coeff = 1;
  for (let k = 0; k < needed && k <= spies; k++) {
    p += coeff * chance ** k * (1 - chance) ** (spies - k);
    coeff = (coeff * (spies - k)) / (k + 1);
  }
  return p;
}

export function teamOdds(
  analysis: Analysis,
  snapshot: Snapshot,
  team: readonly number[],
  mission: number,
  situation: Situation,
  env: ModelEnv,
): TeamOdds {
  const mask = maskOf(team);
  const needed = failsNeeded(analysis.playerCount, mission);
  // The success chance depends only on how many spies are aboard: cache it.
  const bySpies: number[] = [];
  let pClean = 0;
  let pSuccess = 0;
  analysis.worlds.forEach((world, i) => {
    const w = snapshot.weights[i];
    if (w === 0) return;
    const spies = popcount(world & mask);
    if (spies === 0) {
      pClean += w;
      pSuccess += w;
      return;
    }
    bySpies[spies] ??= successChance(
      spies,
      needed,
      spyFailChance({ mission, teamSize: team.length, spiesOnTeam: spies, situation }, env).chance,
    );
    pSuccess += w * bySpies[spies];
  });
  return { team: [...team], mission, pClean, pSuccess };
}

/** Every team for these missions, best odds for the Resistance first. */
export function rankTeams(
  analysis: Analysis,
  snapshot: Snapshot,
  missions: readonly number[],
  situation: Situation,
  env: ModelEnv,
  leader?: number,
): TeamOdds[] {
  const n = analysis.playerCount;
  const all = missions.flatMap((mission) =>
    combinations(n, teamSize(n, mission)).map((team) =>
      teamOdds(analysis, snapshot, team, mission, situation, env),
    ),
  );
  return all.sort(
    (a, b) =>
      b.pSuccess - a.pSuccess ||
      b.pClean - a.pClean ||
      Number(leader !== undefined && b.team.includes(leader)) -
        Number(leader !== undefined && a.team.includes(leader)),
  );
}

/**
 * What a spy leader should propose: a team with exactly the spies the mission
 * needs to fail (one, or two for mission 4 at 7+) that looks cleanest to the
 * table — the one it is most likely to approve.
 */
export function rankSpyTeams(
  publicAnalysis: Analysis,
  publicSnapshot: Snapshot,
  spies: readonly number[],
  missions: readonly number[],
  situation: Situation,
  env: ModelEnv,
): TeamOdds[] {
  const n = publicAnalysis.playerCount;
  const spyMask = maskOf(spies);
  return missions
    .flatMap((mission) => {
      const needed = failsNeeded(n, mission);
      return combinations(n, teamSize(n, mission))
        .filter((team) => popcount(maskOf(team) & spyMask) === needed)
        .map((team) => teamOdds(publicAnalysis, publicSnapshot, team, mission, situation, env));
    })
    .sort((a, b) => b.pClean - a.pClean);
}
