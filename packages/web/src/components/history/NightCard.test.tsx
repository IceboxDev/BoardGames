import type { MatchRecord } from "@boardgames/core/history/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NightCard } from "./NightCard";

function makeMatch(overrides: Partial<MatchRecord>): MatchRecord {
  return {
    id: 1,
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
    },
    notes: null,
    recordedBy: "u1",
    recordedAt: "2026-07-10 20:00:00",
    updatedAt: null,
    sortOrder: 0,
    ...overrides,
  };
}

const baseProps = {
  dateKey: null,
  dayLabel: "Fri, Jul 10",
  lock: null,
  isAdmin: true,
  currentUserId: null,
  onReorder: () => {},
};

describe("NightCard (admin reorderable list)", () => {
  // Regression: editing a match changes its content but not its id. The
  // reorderable list used to sync its local order ONLY when the id list
  // changed, so an edited match (e.g. a newly-set variant/scenario) kept
  // rendering its pre-edit state until a reload.
  it("re-renders an edited match when ids are unchanged", () => {
    const before = makeMatch({});
    const { rerender } = render(<NightCard {...baseProps} matches={[before]} />);
    expect(screen.queryByText("Standard")).not.toBeInTheDocument();

    const after = makeMatch({
      outcome: { ...before.outcome, scenario: "Standard" } as MatchRecord["outcome"],
      updatedAt: "2026-07-16 23:05:22",
    });
    rerender(<NightCard {...baseProps} matches={[after]} />);
    expect(screen.getByText("Standard")).toBeInTheDocument();
  });

  it("still adopts a changed id list (add/remove/reorder)", () => {
    const a = makeMatch({ id: 1, gameTitle: "Intarsia" });
    const b = makeMatch({ id: 2, gameTitle: "Not Enough Mana", gameSlug: "not-enough-mana" });
    const { rerender } = render(<NightCard {...baseProps} matches={[a]} />);
    expect(screen.queryByText("Not Enough Mana")).not.toBeInTheDocument();

    rerender(<NightCard {...baseProps} matches={[a, b]} />);
    expect(screen.getByText("Not Enough Mana")).toBeInTheDocument();
  });
});
