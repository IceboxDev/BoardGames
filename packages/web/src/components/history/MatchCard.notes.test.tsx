import type { MatchRecord } from "@boardgames/core/history/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MatchCard } from "./MatchCard";

// The comment recorded with a match shows in its row: clamped while the row
// is closed, whole once it is opened, and not at all when there is none.

const base: MatchRecord = {
  id: 128,
  dateKey: "2026-10-08",
  playedAt: "2026-10-08T16:15:00.000Z",
  gameSlug: "carnegie",
  gameTitle: "Carnegie",
  outcome: {
    kind: "free-for-all",
    players: [
      { userId: "u1", displayName: "Mantas", score: 137 },
      { userId: "u2", displayName: "Simon", score: 43 },
    ],
  },
  notes: "First play for Simon.\nTook about 2½ hours.",
  recordedBy: "u1",
  recordedAt: "2026-10-08 22:00:00",
  updatedAt: "2026-10-08 22:00:00",
  sortOrder: 0,
};

const card = (match: MatchRecord) =>
  render(<MatchCard match={match} isAdmin={false} currentUserId={null} />);

describe("MatchCard — the match's comment", () => {
  it("previews the comment clamped, and shows it whole when the row opens", () => {
    card(base);
    const note = screen.getByText(/First play for Simon/);
    expect(note.className).toContain("line-clamp-2");
    fireEvent.click(screen.getByRole("button", { name: /Carnegie: show standings/ }));
    expect(screen.getByText(/First play for Simon/).className).not.toContain("line-clamp");
  });

  it("shows nothing for a match without a comment (or only whitespace)", () => {
    card({ ...base, notes: "   " });
    expect(screen.queryByText(/First play/)).toBeNull();
  });
});
