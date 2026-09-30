/**
 * The Solver's likelihood model: how probable an observed event is in one
 * world (one set of spies), under the game's rule plus the assumptions.
 *
 * A world is a bitmask of spy seats. Every function here is pure and cheap —
 * the Solver evaluates each event against every world (≤ 210 of them).
 */

import type { MissionCard, ProposalRecord } from "../record";
import { failsNeeded, popcount } from "../rules";
import { type Assumptions, effectiveRule, type RuleId, type RuleSetting } from "./assumptions";

/** Where the table stood just before an event. */
export interface Situation {
  successes: number;
  fails: number;
  /** Rejected proposals earlier in this round (4 ⇒ this vote is the hammer). */
  rejections: number;
}

export interface ModelEnv {
  playerCount: number;
  blindSpies: boolean;
  assumptions: Assumptions;
  /** Hard rules relaxed to a strong soft tilt after they caused a contradiction. */
  relaxed?: ReadonlySet<RuleId>;
}

const RELAXED: RuleSetting = { mode: "soft", strength: 0.9 };

export function setting(env: ModelEnv, id: RuleId): RuleSetting {
  if (env.relaxed?.has(id)) return RELAXED;
  return effectiveRule(env.assumptions, id, env.blindSpies);
}

function weight(s: RuleSetting): number {
  return s.mode === "hard" ? 1 : s.mode === "soft" ? s.strength : 0;
}

export interface MissionContext {
  mission: number;
  teamSize: number;
  /** Spies aboard in the world being scored. */
  spiesOnTeam: number;
  situation: Situation;
}

/**
 * The chance one spy on this team plays Fail. Spies choose independently —
 * they cannot coordinate at the table — so the fail count is binomial.
 * `pinnedBy` names the hard rule that forced the chance to exactly 0 or 1.
 */
/** One step in deriving a spy's fail chance — for the Solver's explanations. */
export interface FailChanceStep {
  /** `null` = the base rate. */
  rule: RuleId | null;
  /** "×(1 − 0.5)" or "→ 0.9 + 0.1 × p" style, for display. */
  formula: string;
  chance: number;
}

export function spyFailChance(
  ctx: MissionContext,
  env: ModelEnv,
): { chance: number; pinnedBy: RuleId | null; steps: FailChanceStep[] } {
  let chance = env.assumptions.baseFailRate;
  let pinnedBy: RuleId | null = null;
  const steps: FailChanceStep[] = [{ rule: null, formula: "base rate", chance }];
  const apply = (id: RuleId, towards: 0 | 1) => {
    const s = setting(env, id);
    const w = weight(s);
    if (w === 0) return;
    const before = chance;
    chance = towards === 0 ? chance * (1 - w) : w + (1 - w) * chance;
    if (s.mode === "hard") pinnedBy = id;
    steps.push({
      rule: id,
      formula:
        s.mode === "hard"
          ? towards === 0
            ? "always → 0"
            : "always → 1"
          : towards === 0
            ? `${fmt(before)} × (1 − ${fmt(w)})`
            : `${fmt(w)} + (1 − ${fmt(w)}) × ${fmt(before)}`,
      chance,
    });
  };

  const needed = failsNeeded(env.playerCount, ctx.mission);
  if (ctx.teamSize === 2) apply("twoPlayerCaution", 0);
  if (needed >= 2 && ctx.spiesOnTeam === 1) apply("loneSpyMission4", 0);
  // A spy can only swing the mission when enough spies are aboard — or when
  // they can't tell (Blind Spies), in which case they try anyway.
  const canSwing = env.blindSpies || ctx.spiesOnTeam >= needed;
  if (canSwing && ctx.situation.successes === 2) apply("matchPointFail", 1);
  if (canSwing && ctx.situation.fails === 2) apply("winningFail", 1);
  return { chance, pinnedBy, steps };
}

function fmt(x: number): string {
  return Number(x.toFixed(3)).toString();
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

export interface MissionObservation {
  mission: number;
  team: readonly number[];
  fails: number;
  /** Per-seat cards where known. */
  cards?: readonly (MissionCard | null)[];
}

export interface Likelihood {
  /** Probability of the observation in this world. */
  p: number;
  /** False when the game's own rule rules the world out (a Resistance Fail). */
  feasible: boolean;
  /** The hard assumption that zeroed `p`, if one did. */
  zeroedBy: RuleId | null;
}

export function missionLikelihood(
  world: number,
  obs: MissionObservation,
  situation: Situation,
  env: ModelEnv,
): Likelihood {
  const teamMask = obs.team.reduce((m, s) => m | (1 << s), 0);
  const spiesOnTeam = popcount(teamMask & world);
  let knownFails = 0;
  let knownSpyPasses = 0;
  let knownSpyFails = 0;
  let unknownSpies = spiesOnTeam;
  for (const seat of obs.team) {
    const card = obs.cards?.[seat] ?? null;
    if (card === null) continue;
    const isSpy = (world & (1 << seat)) !== 0;
    if (card === "fail") {
      knownFails++;
      if (!isSpy) return { p: 0, feasible: false, zeroedBy: null };
      knownSpyFails++;
    } else if (isSpy) knownSpyPasses++;
    if (isSpy) unknownSpies--;
  }
  const unknownFails = obs.fails - knownFails;
  if (unknownFails < 0 || unknownFails > unknownSpies) {
    return { p: 0, feasible: false, zeroedBy: null };
  }
  const { chance, pinnedBy } = spyFailChance(
    { mission: obs.mission, teamSize: obs.team.length, spiesOnTeam, situation },
    env,
  );
  const p =
    chance ** knownSpyFails *
    (1 - chance) ** knownSpyPasses *
    binomial(unknownSpies, unknownFails) *
    chance ** unknownFails *
    (1 - chance) ** (unknownSpies - unknownFails);
  return { p, feasible: true, zeroedBy: p === 0 ? pinnedBy : null };
}

/** The leader's proposal as evidence. */
export function proposalLikelihood(
  world: number,
  proposal: ProposalRecord,
  env: ModelEnv,
): Likelihood {
  let p = 1;
  let zeroedBy: RuleId | null = null;
  const leaderIsSpy = (world & (1 << proposal.leader)) !== 0;
  const teamMask = proposal.team.reduce((m, s) => m | (1 << s), 0);

  if (leaderIsSpy && failsNeeded(env.playerCount, proposal.mission) === 1) {
    if (popcount(teamMask & world) >= 2) {
      const s = setting(env, "noSpyPairs");
      p *= 1 - weight(s);
      if (s.mode === "hard") zeroedBy = "noSpyPairs";
    }
  }
  if (!leaderIsSpy && !proposal.team.includes(proposal.leader)) {
    const s = setting(env, "leaderOnTeam");
    p *= 1 - weight(s);
    if (s.mode === "hard") zeroedBy ??= "leaderOnTeam";
  }
  return { p, feasible: true, zeroedBy: p === 0 ? zeroedBy : null };
}

/** The table's votes on a proposal as evidence. */
export function voteLikelihood(
  world: number,
  proposal: ProposalRecord,
  votes: readonly boolean[],
  situation: Situation,
  env: ModelEnv,
): Likelihood {
  let p = 1;
  let zeroedBy: RuleId | null = null;
  const teamMask = proposal.team.reduce((m, s) => m | (1 << s), 0);
  const hammer = situation.rejections === 4;
  const hammerRule = setting(env, "hammerApprove");
  const spyVotes = weight(setting(env, "spyVotes"));

  votes.forEach((approve, voter) => {
    const isSpy = (world & (1 << voter)) !== 0;
    if (hammer && !approve && !isSpy) {
      p *= 1 - weight(hammerRule);
      if (hammerRule.mode === "hard") zeroedBy = "hammerApprove";
    }
    if (isSpy && spyVotes > 0 && !hammer) {
      // What the spy can see: the whole spy team, or only itself under Blind Spies.
      const visible = env.blindSpies ? 1 << voter : world;
      const backsTeam = (teamMask & visible) !== 0;
      const pApprove = backsTeam ? 0.5 + spyVotes / 2 : 0.5 - spyVotes / 2;
      // Relative to a Resistance voter's uninformative 50/50.
      p *= (approve ? pApprove : 1 - pApprove) / 0.5;
      if (p === 0) zeroedBy ??= "spyVotes";
    }
  });
  return { p, feasible: true, zeroedBy: p === 0 ? zeroedBy : null };
}
