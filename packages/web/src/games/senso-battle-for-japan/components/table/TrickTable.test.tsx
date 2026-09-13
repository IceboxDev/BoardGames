import { createInitialState } from "@boardgames/core/games/senso-battle-for-japan/game-engine";
import { buildPlayerView } from "@boardgames/core/games/senso-battle-for-japan/player-view";
import type { AIStrategyId, GameState } from "@boardgames/core/games/senso-battle-for-japan/types";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MotionConfig } from "framer-motion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TrickTable from "./TrickTable";
import { seatPositions, TABLE_LAYOUTS } from "./table-geometry";

const NAMES = ["Mantas", "Paul", "Aydan", "Nina", "Kai"];

function game(n: number, seed = 7): GameState {
  const strategies: (AIStrategyId | null)[] = [null];
  for (let i = 1; i < n; i++) strategies.push("random");
  return createInitialState(n, strategies, seed);
}

/** Play the first `count` seats' top cards onto the table, in play order from the leader. */
function withPlays(state: GameState, count: number): GameState {
  const n = state.players.length;
  state.table = [];
  for (let i = 0; i < count; i++) {
    const seat = (state.leader + i) % n;
    state.table.push({ seat, card: state.players[seat].hand[0] });
  }
  state.turn = (state.leader + count) % n;
  state.leadSuit = state.table[0] ? "takeda" : null;
  return state;
}

function renderTable(
  state: GameState,
  me = 0,
  orientation: "landscape" | "portrait" = "landscape",
) {
  const view = buildPlayerView(state, me);
  return render(
    <MotionConfig reducedMotion="always">
      <TrickTable view={view} names={NAMES} orientation={orientation} />
    </MotionConfig>,
  );
}

function plates(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>("[data-seat-plate]")];
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("TrickTable — seating", () => {
  it.each([
    2, 3, 4, 5,
  ])("%i seats: one plate and one slot per seat, at the layout's positions", (n) => {
    const { container } = renderTable(game(n));
    const layout = TABLE_LAYOUTS.landscape;
    const expected = seatPositions(layout, n);
    const found = plates(container);
    expect(found).toHaveLength(n);
    for (const [k, pos] of expected.entries()) {
      const plate = found.find(
        (el) =>
          el.style.left === `${pos.plate.x - layout.plate.w / 2}px` &&
          el.style.top === `${pos.plate.y - layout.plate.h / 2}px`,
      );
      expect(plate, `plate ${k}`).toBeDefined();
    }
    expect(container.querySelectorAll(".border-dashed").length).toBeGreaterThanOrEqual(n);
  });

  it("seats the viewer at the bottom and the next seat on the left", () => {
    const { container } = renderTable(game(4), 2);
    const found = plates(container);
    const bottom = found.reduce((a, b) => (Number(b.style.top) > Number(a.style.top) ? b : a));
    const byTop = [...found].sort(
      (a, b) => Number.parseFloat(a.style.top) - Number.parseFloat(b.style.top),
    );
    expect(byTop[byTop.length - 1]?.textContent).toContain("You");
    expect(bottom).toBeDefined();
    const left = [...found].sort(
      (a, b) => Number.parseFloat(a.style.left) - Number.parseFloat(b.style.left),
    )[0];
    expect(left?.textContent).toContain(NAMES[3]);
  });

  it("gives a spectator seat 0's view from the bottom", () => {
    const { container } = renderTable(game(3), -1);
    const byTop = plates(container).sort(
      (a, b) => Number.parseFloat(a.style.top) - Number.parseFloat(b.style.top),
    );
    expect(byTop[byTop.length - 1]?.textContent).toContain(NAMES[0]);
  });

  it("marks the first player, the leader and the active seat", () => {
    const state = game(4);
    state.firstPlayer = 1;
    state.leader = 1;
    state.turn = 1;
    const { container } = renderTable(state);
    const leaderPlate = plates(container).find((el) => el.textContent?.includes(NAMES[1]));
    expect(leaderPlate?.textContent).toContain("leads");
    expect(leaderPlate?.querySelector('[aria-label="First Player"]')).not.toBeNull();
    expect(leaderPlate?.hasAttribute("data-active")).toBe(true);
    expect(screen.getByText(`${NAMES[1]} to lead`)).toBeInTheDocument();
  });
});

describe("TrickTable — the trick", () => {
  it("lands each card in its seat's slot with its play order, and names the lead suit", () => {
    const state = withPlays(game(4), 3);
    const { container } = renderTable(state);
    const cards = container.querySelectorAll("[data-played-card]");
    expect(cards).toHaveLength(3);
    expect(screen.getByRole("img", { name: /played 1st by/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /played 3rd by/ })).toBeInTheDocument();
    expect(screen.getByText("Lead: 武田 Takeda")).toBeInTheDocument();
  });

  it("says when a Ninja was led", () => {
    const state = withPlays(game(4), 1);
    state.leadSuit = null;
    renderTable(state);
    expect(screen.getByText(/Ninja was led/)).toBeInTheDocument();
  });

  it("rings the winner and announces once at settle, with no sweep under reduced motion", () => {
    const state = withPlays(game(4), 4);
    state.phase = "trick-settle";
    state.completedTrick = { round: 1, trick: 1, plays: state.table, winner: 2 };
    const { container } = renderTable(state);
    expect(container.querySelectorAll("[data-played-card][data-winner]")).toHaveLength(1);
    const live = container.querySelectorAll("[aria-live]");
    expect(live).toHaveLength(1);
    expect(live[0]?.textContent).toBe(`${NAMES[2]} wins the conflict`);
    const winnerPlate = plates(container).find((el) => el.textContent?.includes(NAMES[2]));
    expect(winnerPlate?.className).toContain("ring-emerald-400");
    vi.advanceTimersByTime(2000);
    expect(container.querySelectorAll("[data-played-card]")).toHaveLength(4);
  });

  it("opens the hand's large preview when a played card is held, not on a pass-over", () => {
    const state = withPlays(game(4), 2);
    const { container } = renderTable(state);
    const [first, second] = container.querySelectorAll("[data-played-card]");
    fireEvent.pointerEnter(first as Element);
    fireEvent.pointerLeave(first as Element);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByRole("img", { name: /, preview$/ })).toBeNull();
    fireEvent.pointerEnter(second as Element);
    act(() => vi.advanceTimersByTime(1400));
    expect(screen.getByRole("img", { name: /, preview$/ })).toBeInTheDocument();
  });

  it("uses the portrait canvas when asked", () => {
    const { container } = renderTable(withPlays(game(5), 2), 0, "portrait");
    const canvas = container.querySelector<HTMLElement>('[data-testid="trick-table"] > div');
    expect(canvas?.style.width).toBe("1000px");
    expect(canvas?.style.height).toBe("1500px");
    expect(plates(container)).toHaveLength(5);
  });
});
