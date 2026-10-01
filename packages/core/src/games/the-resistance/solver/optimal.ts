/**
 * What the optimal play was, for a decider whose role is known.
 *
 *   Resistance — the team with the highest chance of succeeding by what the
 *     TABLE knows (a team has to be argued into an approval). Only when teams
 *     tie there does the leader's own knowledge break the tie.
 *   Spy — among the teams that fail for certain (enough spies aboard, each
 *     playing Fail), the one that leaves the table MOST uncertain about who
 *     the spies are after the Fail is revealed. Only on a tie does the spy's
 *     own view break it: fewer spies exposed is better.
 *
 * Whatever still ties after both steps is listed — several plays can be
 * equally optimal.
 */

import { combinations, failsNeeded, maskOf, popcount, teamSize } from "../rules";
import type { Lookahead, Position } from "./lookahead";
import { type ModelEnv, missionLikelihood, proposalLikelihood, type Situation } from "./model";
import type { Analysis, Snapshot } from "./posterior";
import { teamOdds } from "./recommend";

/** Scores within this of each other count as a tie. */
export const TIE = 0.005;

export interface ScoredOption {
  team: number[];
  mission: number;
  /** The first criterion (table P(success), or bits of table uncertainty left). */
  primary: number;
  /** The tie-break (own-view P(success), or −spies exposed). */
  secondary: number;
  optimal: boolean;
}

export interface OptimalChoice {
  /**
   * resistance — one-mission odds (table first, own view to break ties);
   * game — whole-game win chance by lookahead (own view first, table to break ties);
   * spy — table's doubt after a sure Fail (fewer spies aboard to break ties).
   */
  metric: "resistance" | "game" | "spy";
  /** Best first; every optimal option, then the best others (the chosen one always included). */
  options: ScoredOption[];
  chosen: ScoredOption;
  /** How many options there were in all. */
  total: number;
}

export function markOptimal(all: ScoredOption[]): ScoredOption[] {
  if (all.length === 0) return all;
  const top = Math.max(...all.map((o) => o.primary));
  const tied = all.filter((o) => o.primary >= top - TIE);
  const second = Math.max(...tied.map((o) => o.secondary));
  for (const o of tied) o.optimal = o.secondary >= second - TIE;
  return all.sort((a, b) => b.primary - a.primary || b.secondary - a.secondary);
}

export function pick(all: ScoredOption[], chosenKey: string, keep = 6): OptimalChoice["options"] {
  const key = (o: ScoredOption) => `${o.mission}:${o.team.join()}`;
  const optimal = all.filter((o) => o.optimal);
  const rest = all.filter((o) => !o.optimal).slice(0, Math.max(0, keep - optimal.length));
  const shown = [...optimal, ...rest];
  const chosen = all.find((o) => key(o) === chosenKey);
  if (chosen && !shown.includes(chosen)) shown.push(chosen);
  return shown;
}

/** A Resistance leader's options: table P(success) first, own-view P(success) to break ties. */
export function resistanceProposalChoice(
  table: Analysis,
  tableSnap: Snapshot,
  own: Analysis,
  ownSnap: Snapshot,
  missions: readonly number[],
  situation: Situation,
  env: ModelEnv,
  chosen: { team: readonly number[]; mission: number },
): OptimalChoice {
  const n = table.playerCount;
  const all = markOptimal(
    missions.flatMap((mission) =>
      combinations(n, teamSize(n, mission)).map((team) => ({
        team,
        mission,
        primary: teamOdds(table, tableSnap, team, mission, situation, env).pSuccess,
        secondary: teamOdds(own, ownSnap, team, mission, situation, env).pSuccess,
        optimal: false,
      })),
    ),
  );
  const chosenKey = `${chosen.mission}:${chosen.team.join()}`;
  const hit = all.find((o) => `${o.mission}:${o.team.join()}` === chosenKey);
  if (!hit) throw new Error("Chosen team is not a legal option");
  return { metric: "resistance", options: pick(all, chosenKey), chosen: hit, total: all.length };
}

/** Bits of uncertainty left in a weight vector. */
function entropy(weights: Float64Array | readonly number[]): number {
  let sum = 0;
  for (const w of weights) sum += w;
  if (sum <= 0) return 0;
  let h = 0;
  for (const w of weights) {
    if (w > 0) {
      const p = w / sum;
      h -= p * Math.log2(p);
    }
  }
  return h;
}

/**
 * The table's uncertainty (bits) about the spies after this team is proposed
 * and the spies aboard all play Fail.
 */
export function uncertaintyAfterFail(
  table: Analysis,
  tableSnap: Snapshot,
  leader: number,
  team: readonly number[],
  mission: number,
  fails: number,
  situation: Situation,
  env: ModelEnv,
): number {
  const proposal = { leader, mission, team: [...team], votes: null };
  const weights = table.worlds.map((world, i) => {
    const w = tableSnap.weights[i] ?? 0;
    if (w === 0) return 0;
    const lead = proposalLikelihood(world, proposal, env);
    const outcome = missionLikelihood(world, { mission, team, fails }, situation, env);
    return outcome.feasible ? w * lead.p * outcome.p : 0;
  });
  return entropy(weights);
}

/**
 * A spy leader's options: teams that surely fail (enough known spies aboard),
 * ranked by how much the table is left guessing afterwards, then by fewer
 * spies exposed. `spies` are the spies this leader knows (itself under Blind Spies).
 */
export function spyProposalChoice(
  table: Analysis,
  tableSnap: Snapshot,
  leader: number,
  spies: readonly number[],
  missions: readonly number[],
  situation: Situation,
  env: ModelEnv,
  chosen: { team: readonly number[]; mission: number },
): OptimalChoice & { chosenCanFail: boolean } {
  const n = table.playerCount;
  const spyMask = maskOf(spies);
  const chosenKey = `${chosen.mission}:${chosen.team.join()}`;
  const score = (team: number[], mission: number): ScoredOption => {
    const aboard = popcount(maskOf(team) & spyMask);
    return {
      team,
      mission,
      primary: uncertaintyAfterFail(
        table,
        tableSnap,
        leader,
        team,
        mission,
        aboard,
        situation,
        env,
      ),
      secondary: -aboard,
      optimal: false,
    };
  };
  const valid = markOptimal(
    missions.flatMap((mission) =>
      combinations(n, teamSize(n, mission))
        .filter((team) => popcount(maskOf(team) & spyMask) >= failsNeeded(n, mission))
        .map((team) => score(team, mission)),
    ),
  );
  const hit = valid.find((o) => `${o.mission}:${o.team.join()}` === chosenKey);
  const chosenOption = hit ?? score([...chosen.team], chosen.mission);
  const options = pick(valid, chosenKey);
  if (!hit) options.push(chosenOption);
  return {
    metric: "spy",
    options,
    chosen: chosenOption,
    total: valid.length,
    chosenCanFail: hit !== undefined,
  };
}

/**
 * A Resistance leader's options by the whole game: each team is played out to
 * the end (`lookahead.ts`) and scored by the chance the Resistance wins —
 * first over the worlds the leader considers possible (what they actually
 * know), then over the table's worlds (how arguable the team is) to break ties.
 */
export function resistanceGameChoice(
  look: Lookahead,
  position: Position,
  ownWeights: Float64Array,
  tableWeights: Float64Array,
  candidates: readonly { team: number[]; mission: number }[],
  chosen: { team: readonly number[]; mission: number },
): OptimalChoice {
  const all = markOptimal(
    candidates.map(({ team, mission }) => {
      const choice = { mission, mask: maskOf(team) };
      const play = (world: number) => look.valueOf(position, choice, world);
      return {
        team,
        mission,
        primary: look.expect(ownWeights, play),
        secondary: look.expect(tableWeights, play),
        optimal: false,
      };
    }),
  );
  const chosenKey = `${chosen.mission}:${chosen.team.join()}`;
  const hit = all.find((o) => `${o.mission}:${o.team.join()}` === chosenKey);
  if (!hit) throw new Error("Chosen team is not among the candidates");
  return { metric: "game", options: pick(all, chosenKey), chosen: hit, total: all.length };
}
