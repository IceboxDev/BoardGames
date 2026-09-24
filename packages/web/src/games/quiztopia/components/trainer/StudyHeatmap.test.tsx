import { addDays } from "@boardgames/core/games/quiztopia/srs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildHeatmap, cellSentence, HEATMAP_WEEKS, heatLevel } from "./heatmap";
import { StudyHeatmap } from "./StudyHeatmap";

// The heatmap is twelve full Monday-to-Sunday weeks ending in today's week,
// coloured by review count, and every cell speaks its date and count.

const TODAY = "2026-09-24"; // a Thursday

const DAYS = [
  { date: TODAY, reviews: 12, good: 10, again: 2, newIntroduced: 3 },
  { date: addDays(TODAY, -1), reviews: 3, good: 3, again: 0, newIntroduced: 0 },
  { date: addDays(TODAY, -30), reviews: 40, good: 30, again: 10, newIntroduced: 5 },
  // Outside the window — must not appear.
  { date: addDays(TODAY, -120), reviews: 99, good: 99, again: 0, newIntroduced: 0 },
];

describe("buildHeatmap", () => {
  it("lays out 12 weeks × 7 days ending in today's week, Monday first", () => {
    const columns = buildHeatmap(DAYS, TODAY);
    expect(columns).toHaveLength(HEATMAP_WEEKS);
    expect(columns.every((c) => c.cells.length === 7)).toBe(true);
    const last = columns[HEATMAP_WEEKS - 1];
    expect(last.monday).toBe("2026-09-21");
    expect(last.cells.map((c) => c.date)).toContain(TODAY);
    expect(columns[0].monday).toBe(addDays("2026-09-21", -7 * (HEATMAP_WEEKS - 1)));
    // Days after today are future and empty.
    const future = last.cells.filter((c) => c.date > TODAY);
    expect(future).toHaveLength(3);
    expect(future.every((c) => c.future && c.count === 0)).toBe(true);
  });

  it("carries each day's review count and level", () => {
    const cells = buildHeatmap(DAYS, TODAY).flatMap((c) => c.cells);
    const byDate = new Map(cells.map((c) => [c.date, c]));
    expect(byDate.get(TODAY)).toMatchObject({ count: 12, level: 2 });
    expect(byDate.get(addDays(TODAY, -1))).toMatchObject({ count: 3, level: 1 });
    expect(byDate.get(addDays(TODAY, -30))).toMatchObject({ count: 40, level: 4 });
    expect(byDate.get(addDays(TODAY, -2))).toMatchObject({ count: 0, level: 0 });
    expect(byDate.has(addDays(TODAY, -120))).toBe(false);
    expect(cells.filter((c) => c.count > 0)).toHaveLength(3);
  });

  it("marks month boundaries on the first column of each month", () => {
    const labels = buildHeatmap(DAYS, TODAY).map((c) => c.monthLabel);
    expect(labels[0]).not.toBeNull();
    expect(labels.filter((l) => l !== null).length).toBeGreaterThanOrEqual(3);
  });

  it("steps the level with the count", () => {
    expect([0, 1, 4, 5, 14, 15, 29, 30].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
});

describe("StudyHeatmap", () => {
  it("renders 84 cells, each with a spoken date and count", () => {
    render(<StudyHeatmap days={DAYS} today={TODAY} />);
    const grid = screen.getByRole("list", { name: /Reviews per day/ });
    const cells = grid.querySelectorAll("[data-level]");
    expect(cells).toHaveLength(HEATMAP_WEEKS * 7);
    expect(screen.getByText(/: 12 reviews$/)).toBeInTheDocument();
    expect(screen.getByText(/: 40 reviews$/)).toBeInTheDocument();
    expect(screen.getAllByText(/: no reviews$/).length).toBeGreaterThan(70);
    expect(screen.getAllByText(/: not yet$/)).toHaveLength(3);
    expect(screen.getByText("3 of the last 81 days")).toBeInTheDocument();
  });

  it("speaks a singular review", () => {
    expect(cellSentence({ date: TODAY, count: 1, level: 1, future: false })).toMatch(/: 1 review$/);
  });
});
