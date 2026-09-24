// The result record and the replay the server persists at game over.
// `scoreA`/`scoreB` are buildings won / lost — `persistReplay` maps them to
// `score_p0` / `score_p1`, and `outcome` decides the p0/p1 "winner" bucket
// the match-history table already understands for co-ops.

import { difficultyLabel } from "./player-view.ts";
import { lostCount, requiredFor, wonCount } from "./rules.ts";
import {
  BUILDING_COUNT,
  type QuiztopiaGameState,
  type QuiztopiaReplayLog,
  type QuiztopiaResult,
} from "./types.ts";

export function toResult(gs: QuiztopiaGameState): QuiztopiaResult {
  if (gs.outcome === null) throw new Error("toResult called before the game is over");

  // Redrawn questions (`correct: null`) were never answered, so they count
  // neither as asked nor toward a category.
  const perCategory = Array.from({ length: BUILDING_COUNT }, () => ({ asked: 0, correct: 0 }));
  let questionsAsked = 0;
  for (const e of gs.questionLog) {
    if (e.correct === null) continue;
    const slot = perCategory[e.categoryIndex];
    if (!slot) continue;
    slot.asked += 1;
    if (e.correct) slot.correct += 1;
    questionsAsked += 1;
  }

  return {
    outcome: gs.outcome,
    bakery: gs.bakery,
    bakeryComplete: gs.bakeryComplete,
    won: wonCount(gs),
    lost: lostCount(gs),
    required: requiredFor(gs),
    questionsAsked,
    cardsUsed: gs.cardsUsed,
    difficulty: gs.difficulty,
    difficultyLabel: difficultyLabel(gs.difficulty),
    expert: gs.expert,
    deck: gs.deck,
    playerCount: gs.playerCount,
    seed: gs.seed,
    perCategory,
  };
}

export function buildReplayLog(gs: QuiztopiaGameState): QuiztopiaReplayLog {
  const result = toResult(gs);
  return {
    slug: "quiztopia",
    version: 1,
    config: {
      playerCount: gs.playerCount,
      seats: [...gs.seats],
      difficulty: gs.difficulty,
      expert: gs.expert,
      deck: gs.deck,
      seed: gs.seed,
      language: gs.language,
    },
    result,
    questions: gs.questionLog.map((e) => ({ ...e, helpPlayed: [...e.helpPlayed] })),
    helpUsed: gs.helpDeck.filter((c) => c.used).map((c) => c.id),
    finalBuildings: [...gs.buildings],
    playerCount: gs.playerCount,
    scoreA: result.won,
    scoreB: result.lost,
  };
}
