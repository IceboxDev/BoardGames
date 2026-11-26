import type { ProfileMatchSummaryItem } from "@boardgames/core/protocol";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MatchTimeline, timelineRows } from "./MatchTimeline.tsx";

const base: ProfileMatchSummaryItem = {
  matchId: 1,
  dateKey: "2026-07-10",
  playedAt: "2026-07-10T19:00:00Z",
  gameSlug: "lost-cities",
  gameTitle: "Lost Cities",
  kind: "free-for-all",
  result: "win",
  credit: 1,
  place: 1,
  fieldSize: 2,
  score: null,
  sessions: 1,
  coPlayerIds: [],
  sittings: [],
};

const campaign: ProfileMatchSummaryItem = {
  ...base,
  matchId: 7,
  dateKey: "2026-07-07",
  playedAt: "2026-07-07T19:00:00Z",
  gameSlug: "dungeons-and-dragons",
  gameTitle: "Dungeons & Dragons",
  kind: "coop",
  result: "moderator",
  credit: null,
  place: null,
  fieldSize: null,
  sessions: 2,
  sittings: [
    {
      matchId: 3,
      dateKey: "2026-06-20",
      playedAt: "2026-06-20T19:00:00Z",
      result: "moderator",
      coPlayerIds: ["a"],
    },
    {
      matchId: 7,
      dateKey: "2026-07-07",
      playedAt: "2026-07-07T19:00:00Z",
      result: "moderator",
      coPlayerIds: ["a", "b"],
    },
  ],
};

describe("MatchTimeline", () => {
  it("lists every session of a campaign as its own row, on its own night", () => {
    const rows = timelineRows([
      base,
      campaign,
      { ...base, matchId: 2, playedAt: "2026-06-25T19:00:00Z", dateKey: "2026-06-25" },
    ]);
    expect(rows.map((r) => [r.matchId, r.part])).toEqual([
      [1, null],
      [7, 2],
      [2, null],
      [3, 1],
    ]);
    render(<MatchTimeline items={[base, campaign]} filtered={false} />);
    expect(screen.getAllByText("Dungeons & Dragons")).toHaveLength(2);
    expect(screen.getByText("Session 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Session 2 of 2")).toBeInTheDocument();
  });
});
