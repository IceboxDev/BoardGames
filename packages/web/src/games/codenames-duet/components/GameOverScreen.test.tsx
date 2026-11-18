import { buildDuetView } from "@boardgames/core/games/codenames-duet/player-view";
import {
  applyClue,
  applyGuess,
  createDuet,
  partnerOf,
} from "@boardgames/core/games/codenames-duet/rules";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GameOverScreen from "./GameOverScreen";

// A room's game-over line is the same in Duet as in Codenames (`roomNotice`):
// a guest is told the host decides, and a refused rematch says why.

function finishedView() {
  let s = createDuet({
    seed: 5,
    ai: [null, null],
    language: "en",
    timerTokens: 9,
    clueTimerSec: 0,
    guessTimerSec: 0,
  });
  const giver = s.giver;
  s = applyClue(s, giver, { word: "zqx", count: 1 });
  const assassin = s.key.findIndex((pair) => pair[giver] === "assassin");
  s = applyGuess(s, partnerOf(giver), assassin);
  expect(s.phase).toBe("over");
  return buildDuetView(s, "over", partnerOf(giver));
}

describe("Duet game over", () => {
  it("tells a room guest the host decides what's next", () => {
    render(
      <GameOverScreen view={finishedView()} names={[null, null]} actions={[]} waitingForHost />,
    );
    expect(screen.getByText(/Waiting for the host/)).toBeInTheDocument();
  });

  it("says why a rematch couldn't start", () => {
    render(
      <GameOverScreen
        view={finishedView()}
        names={[null, null]}
        actions={[]}
        error="Ann left the table"
      />,
    );
    expect(screen.getByText("Ann left the table")).toBeInTheDocument();
    expect(screen.queryByText(/Waiting for the host/)).toBeNull();
  });
});
