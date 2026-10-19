import { scoreRaceForSlug } from "@boardgames/core/history/score-race";
import type { MatchOutcomeFreeForAll } from "@boardgames/core/history/types";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ScoreRaceForm } from "./ScoreRaceForm";

const USERS = ["Mantas", "Paul"].map((name, i) => ({ id: `u${i + 1}`, name }));
const TAKE_5 = (() => {
  const race = scoreRaceForSlug("take-5");
  if (!race) throw new Error("take-5 race missing");
  return race;
})();

let latest: MatchOutcomeFreeForAll | null = null;

function Harness() {
  const [value, setValue] = useState<MatchOutcomeFreeForAll>({
    kind: "free-for-all",
    players: USERS.map((u) => ({ userId: u.id, displayName: u.name, score: 0 })),
  });
  latest = value;
  return <ScoreRaceForm users={USERS} value={value} onChange={setValue} race={TAKE_5} />;
}

describe("ScoreRaceForm", () => {
  it("adds hands until a total passes 66, then crowns the lowest total", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Mantas — hand 1"), "40");
    await user.type(screen.getByLabelText("Paul — hand 1"), "12");
    expect(screen.getByText(/keep adding hands/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ Add hand" }));
    await user.type(screen.getByLabelText("Mantas — hand 2"), "27");
    await user.type(screen.getByLabelText("Paul — hand 2"), "3");

    expect(
      screen.getByText(/Game over after hand 2 — Mantas passed 66\. Paul wins with 15\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add hand" })).toBeDisabled();
    expect(latest?.players.map((p) => [p.raceRounds, p.score])).toEqual([
      [[40, 27], 67],
      [[12, 3], 15],
    ]);
  });
});
