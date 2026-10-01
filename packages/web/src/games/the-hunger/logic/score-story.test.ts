import { pickAiAction } from "@boardgames/core/games/the-hunger/ai-strategies";
import { applyActionPure, createInitialState } from "@boardgames/core/games/the-hunger/game-engine";
import { getActivePlayer } from "@boardgames/core/games/the-hunger/rules";
import { computeResult } from "@boardgames/core/games/the-hunger/scoring";
import { describe, expect, it } from "vitest";
import { scoreStory } from "./score-story";

describe("scoreStory", () => {
  it("splits every Vampire's score into parts that add up, and a curve that ends on it", () => {
    let s = createInitialState({
      playerCount: 3,
      strategies: ["heuristic-v1", "heuristic-v1", "heuristic-v1"],
      seed: 11,
    });
    for (let i = 0; i < 20000 && s.phase !== "game-over"; i++) {
      s = applyActionPure(s, getActivePlayer(s), pickAiAction(s));
    }
    expect(s.phase).toBe("game-over");
    const result = s.result ?? computeResult(s);
    const stories = scoreStory(s.log, result);
    stories.forEach((story, seat) => {
      const parts = Object.values(story.sources).reduce((a, b) => a + b, 0);
      expect(parts + story.other + story.sunrise).toBe(result.breakdown[seat].total);
      // The log accounts for everything scored during the night.
      expect(story.other).toBe(0);
      expect(story.curve.at(-1)).toBe(result.breakdown[seat].total);
      expect(story.curve.length).toBeGreaterThanOrEqual(15);
    });
  });
});
