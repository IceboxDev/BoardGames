import type { AdminSkillStateResponse } from "@boardgames/core/protocol";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkillRatingsCardView } from "./SkillRatingsCard";

// The card's job is to make two things unmissable: that the ratings are behind
// the history until someone presses the button, and that recomputing does NOT
// announce anything by itself.

const BASE: AdminSkillStateResponse = {
  computedAt: "2026-08-19 21:04:11",
  baselineComputedAt: "2026-08-12 20:41:03",
  configVersion: 5,
  stale: false,
  matchesTotal: 92,
  matchesChangedSince: 0,
  eligibleCount: 11,
  candidates: [],
  live: null,
  players: { u1: { name: "Riccardo Giordano", image: null } },
};

function renderCard(state: AdminSkillStateResponse | undefined, expanded = true) {
  return render(
    <SkillRatingsCardView
      state={state}
      expanded={expanded}
      onToggle={() => {}}
      onRecompute={() => {}}
      onPublish={() => {}}
      onRetract={() => {}}
    />,
  );
}

describe("SkillRatingsCardView", () => {
  it("counts the matches recorded since the last run when stale", () => {
    renderCard({ ...BASE, stale: true, matchesChangedSince: 6 });
    expect(screen.getByText(/6 matches recorded since the last run/)).toBeInTheDocument();
  });

  it("says so plainly when nothing has changed", () => {
    renderCard(BASE);
    expect(screen.getByText(/Up to date/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing has moved since the previous run/)).toBeInTheDocument();
  });

  it("promises that recomputing announces nothing", () => {
    renderCard(BASE);
    expect(screen.getByText(/Announces nothing on its own/)).toBeInTheDocument();
  });

  it("offers each candidate for publishing, biggest first", () => {
    renderCard({
      ...BASE,
      candidates: [
        {
          key: "trait-climb:pln:u1",
          subjectUserId: "u1",
          event: { kind: "trait-climb", trait: "pln", from: 4, to: 1, fieldSize: 6 },
          score: 167,
        },
        {
          key: "profile-unlocked:u1",
          subjectUserId: "u1",
          event: { kind: "profile-unlocked", ratedMatches: 9, distinctGames: 3 },
          score: 90,
        },
      ],
    });
    expect(screen.getAllByRole("button", { name: "Publish" })).toHaveLength(2);
    expect(screen.getByText("Riccardo reached 1st in Planning")).toBeInTheDocument();
  });

  it("shows what is live, how many saw it, and a way to pull it", () => {
    renderCard({
      ...BASE,
      live: {
        id: 4,
        createdAt: "2026-08-19 09:12:44",
        subjectUserId: "u1",
        payload: { event: { kind: "streak-lead", length: 5 }, runnersUp: [], proof: null },
        seenBy: 7,
      },
    });
    expect(screen.getByText("Riccardo is on five straight wins")).toBeInTheDocument();
    expect(screen.getByText(/seen by 7/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retract" })).toBeInTheDocument();
  });

  it("tells a never-run instance what it is for", () => {
    renderCard({ ...BASE, computedAt: null, baselineComputedAt: null, stale: true });
    expect(screen.getByText(/Never computed/)).toBeInTheDocument();
  });
});
