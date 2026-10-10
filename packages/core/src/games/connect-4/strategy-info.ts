/** The AI ladder's ids and words — browse-safe, shared by the manifest and the engine. */

export const AI_STRATEGY_IDS = ["blocker", "lookahead", "deep", "perfect"] as const;
export type AIStrategyId = (typeof AI_STRATEGY_IDS)[number];

export const AI_STRATEGY_LABELS: Record<AIStrategyId, string> = {
  blocker: "Blocker",
  lookahead: "Lookahead",
  deep: "Deep Search",
  perfect: "Perfect",
};

export const AI_STRATEGY_DESCRIPTIONS: Record<AIStrategyId, string> = {
  blocker: "Takes a win when it sees one and blocks yours, but plans nothing.",
  lookahead: "Searches six moves ahead and builds threats.",
  deep: "A much deeper search that sets traps several moves out.",
  perfect:
    "Never misplays, yet varies its play from game to game: an exact solver with an opening book that picks at random among moves within a disc of the best. In PopOut, and on 8×7 before the middle game, it plays Deep Search.",
};
