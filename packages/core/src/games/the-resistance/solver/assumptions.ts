/**
 * The behavioural assumptions the Solver weighs worlds by. The game's own rule
 * ("the Resistance only ever plays Success") is not here — it is always hard.
 *
 * Each rule is `off`, `soft` (a likelihood tilt of `strength`) or `hard`
 * (a world that breaks it is eliminated). When a hard rule would eliminate
 * every remaining world the Solver reports the contradiction and relaxes it
 * for that one event (see `posterior.ts`).
 *
 * Spies never coordinate their mission cards: they cannot agree at the table
 * who plays red, so each spy on a team decides on their own — two spies on
 * one team risk a double fail, which is why a spy leader avoids it.
 */

import { z } from "zod";

export const RULE_IDS = [
  "twoPlayerCaution",
  "matchPointFail",
  "winningFail",
  "noSpyPairs",
  "loneSpyMission4",
  "hammerApprove",
  "leaderOnTeam",
  "spyVotes",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export const RuleModeSchema = z.enum(["off", "soft", "hard"]);
export type RuleMode = z.infer<typeof RuleModeSchema>;

export const RuleSettingSchema = z.object({
  mode: RuleModeSchema,
  /** How strongly a `soft` rule tilts the odds, 0–1. Ignored when off/hard. */
  strength: z.number().min(0).max(1),
});
export type RuleSetting = z.infer<typeof RuleSettingSchema>;

export interface RuleInfo {
  label: string;
  description: string;
  /** Whose idea the rule is — the table's own examples vs. the Solver's additions. */
  source: "table" | "solver";
  defaults: RuleSetting;
  /** Meaningless when spies don't know each other (Blind Spies). */
  needsSpiesKnown?: boolean;
}

export const RULE_INFO: Record<RuleId, RuleInfo> = {
  twoPlayerCaution: {
    label: "Spies hesitate on two-player teams",
    description:
      "A spy might not play Fail on a team of two — the other member would know exactly who did it.",
    source: "table",
    defaults: { mode: "soft", strength: 0.5 },
  },
  matchPointFail: {
    label: "Spies always fail at Resistance match point",
    description:
      "When the Resistance already has two successes, a spy on the team always plays Fail.",
    source: "table",
    defaults: { mode: "hard", strength: 0.9 },
  },
  noSpyPairs: {
    label: "A spy leader never puts two spies on a team",
    description:
      "Spies can't agree out loud who plays red, so two spies on one team risk a double fail that exposes both. A spy leader avoids it.",
    source: "table",
    defaults: { mode: "hard", strength: 0.9 },
    needsSpiesKnown: true,
  },
  winningFail: {
    label: "Spies always fail when it wins the game",
    description: "When the Spies already have two failed missions, a spy on the team plays Fail.",
    source: "solver",
    defaults: { mode: "hard", strength: 0.9 },
  },
  loneSpyMission4: {
    label: "A lone spy doesn't fail mission 4 at 7+",
    description:
      "Mission 4 needs two Fails at 7+ players; a spy who knows they're the only one aboard gains nothing by exposing themselves.",
    source: "solver",
    defaults: { mode: "soft", strength: 0.8 },
    needsSpiesKnown: true,
  },
  hammerApprove: {
    label: "The Resistance never rejects the fifth proposal",
    description:
      "A fifth rejection in one round hands the Spies the game, so only a spy votes it down.",
    source: "solver",
    defaults: { mode: "hard", strength: 0.9 },
  },
  leaderOnTeam: {
    label: "A Resistance leader includes themself",
    description:
      "A Resistance leader knows they are clean, so leaving themself off the team is a mild spy tell.",
    source: "solver",
    defaults: { mode: "soft", strength: 0.2 },
  },
  spyVotes: {
    label: "Spies back teams with a spy",
    description:
      "A spy approves teams carrying a spy more readily than clean ones. Off by default: it treats every Resistance vote as a coin flip, so a unanimous Yes (the usual first-round vote) wrongly reads as 'the spies liked this team'.",
    source: "solver",
    defaults: { mode: "off", strength: 0.2 },
  },
};

export const AssumptionsSchema = z.object({
  /** How often a spy plays Fail when no rule says otherwise. */
  baseFailRate: z.number().min(0.05).max(1),
  rules: z.object({
    twoPlayerCaution: RuleSettingSchema,
    matchPointFail: RuleSettingSchema,
    winningFail: RuleSettingSchema,
    noSpyPairs: RuleSettingSchema,
    loneSpyMission4: RuleSettingSchema,
    hammerApprove: RuleSettingSchema,
    leaderOnTeam: RuleSettingSchema,
    spyVotes: RuleSettingSchema,
  } satisfies Record<RuleId, typeof RuleSettingSchema>),
});
export type Assumptions = z.infer<typeof AssumptionsSchema>;

export function defaultAssumptions(): Assumptions {
  return {
    baseFailRate: 0.75,
    rules: {
      twoPlayerCaution: { ...RULE_INFO.twoPlayerCaution.defaults },
      matchPointFail: { ...RULE_INFO.matchPointFail.defaults },
      winningFail: { ...RULE_INFO.winningFail.defaults },
      noSpyPairs: { ...RULE_INFO.noSpyPairs.defaults },
      loneSpyMission4: { ...RULE_INFO.loneSpyMission4.defaults },
      hammerApprove: { ...RULE_INFO.hammerApprove.defaults },
      leaderOnTeam: { ...RULE_INFO.leaderOnTeam.defaults },
      spyVotes: { ...RULE_INFO.spyVotes.defaults },
    },
  };
}

/** The setting actually in force: rules that need known spies switch off under Blind Spies. */
export function effectiveRule(
  assumptions: Assumptions,
  id: RuleId,
  blindSpies: boolean,
): RuleSetting {
  const setting = assumptions.rules[id];
  if (blindSpies && RULE_INFO[id].needsSpiesKnown) return { mode: "off", strength: 0 };
  return setting;
}

/** 1 when hard, `strength` when soft, 0 when off — "how much of the rule applies". */
export function ruleWeight(setting: RuleSetting): number {
  if (setting.mode === "hard") return 1;
  if (setting.mode === "soft") return setting.strength;
  return 0;
}
