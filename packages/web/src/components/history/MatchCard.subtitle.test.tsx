import type { MatchRecord } from "@boardgames/core/history/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MatchCard } from "./MatchCard";

// Exact shape of prod row id=53 (Intarsia edited to scenario "Standard").
const intarsia: MatchRecord = {
  id: 53,
  dateKey: null,
  playedAt: "2026-07-10T20:00:00.000Z",
  gameSlug: "intarsia",
  gameTitle: "Intarsia",
  outcome: {
    kind: "free-for-all",
    players: [
      { userId: "u1", displayName: "Mantas", score: 116 },
      { userId: "u2", displayName: "Jaqueline", score: 100 },
    ],
    scenario: "Standard",
  },
  notes: null,
  recordedBy: "u1",
  recordedAt: "2026-07-10 20:00:00",
  updatedAt: "2026-07-16 23:05:22",
  sortOrder: 0,
};

describe("MatchCard subtitle", () => {
  it("shows the persisted scenario under the title", () => {
    render(<MatchCard match={intarsia} isAdmin={false} currentUserId={null} />);
    expect(screen.getByText("Standard")).toBeInTheDocument();
  });
});
