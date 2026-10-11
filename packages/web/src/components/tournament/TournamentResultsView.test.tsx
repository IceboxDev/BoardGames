import type { TournamentResults } from "@boardgames/core/tournament/results";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TournamentResultsView } from "./TournamentResultsView";

const base = {
  formatVersion: 1 as const,
  slug: "test",
  generatedAt: "2026-01-01T00:00:00.000Z",
};

describe("TournamentResultsView", () => {
  it("renders a head-to-head file as a win-rate matrix", () => {
    const results: TournamentResults = {
      ...base,
      strategies: [
        { id: "x", label: "Ex" },
        { id: "y", label: "Why" },
      ],
      tables: [
        {
          playerCount: 2,
          matchups: [
            {
              a: "x",
              b: "y",
              games: 10,
              aWins: 7,
              bWins: 3,
              draws: 0,
              avgScoreA: null,
              avgScoreB: null,
            },
          ],
        },
      ],
    };
    render(<TournamentResultsView results={results} onBack={() => {}} />);
    expect(screen.getByText("70.0%")).toBeTruthy();
    expect(screen.getByText("30.0%")).toBeTruthy();
    expect(screen.getByText(/10 games per matchup/)).toBeTruthy();
  });

  it("renders a co-op benchmark as one win-rate row per strategy", () => {
    const results: TournamentResults = {
      ...base,
      kind: "benchmark",
      strategies: [{ id: "solo", label: "Solo AI" }],
      tables: [
        { playerCount: 2, runs: [{ strategy: "solo", games: 40, wins: 10, avgScore: null }] },
      ],
    };
    render(<TournamentResultsView results={results} onBack={() => {}} />);
    expect(screen.getByText("Solo AI")).toBeTruthy();
    expect(screen.getByText("25.0%")).toBeTruthy();
    expect(screen.getByText("10 / 40")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("25");
    expect(screen.getByText(/40 games per AI/)).toBeTruthy();
  });
});
