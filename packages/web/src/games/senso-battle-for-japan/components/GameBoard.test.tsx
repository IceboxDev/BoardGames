import { createInitialState } from "@boardgames/core/games/senso-battle-for-japan/game-engine";
import { buildPlayerView } from "@boardgames/core/games/senso-battle-for-japan/player-view";
import { getLegalActions } from "@boardgames/core/games/senso-battle-for-japan/rules";
import type { GameState } from "@boardgames/core/games/senso-battle-for-japan/types";
import { canonicalEquals } from "@boardgames/core/machines/action-validation";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GameBoard from "./GameBoard";

let restore: (() => void) | null = null;

beforeEach(() => {
  const original = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  restore = () =>
    Object.defineProperty(window, "matchMedia", { configurable: true, value: original });
});

afterEach(() => {
  restore?.();
  vi.restoreAllMocks();
});

function rewardsFor(state: GameState, seat: number, tier: 1 | 3 | 5 | 7) {
  state.phase = "rewards";
  state.rewardQueue = [{ player: seat, tier, picksLeft: tier === 7 ? 2 : 1, used: [] }];
  for (const p of state.players) p.hand = [];
  return { view: buildPlayerView(state, seat), legal: getLegalActions(state) };
}

function boardProps(state: GameState, seat: number, tier: 1 | 3 | 5 | 7, onAction = vi.fn()) {
  const { view, legal } = rewardsFor(state, seat, tier);
  return {
    view,
    legalActions: legal,
    isMyTurn: true,
    isAiThinking: false,
    playerNames: [],
    onAction,
  };
}

describe("GameBoard — rewards", () => {
  it("gates the reward kinds by tier and shows the won-conflicts tray while the hand is empty", () => {
    render(<GameBoard {...boardProps(createInitialState(2, [null, "random"], 5), 0, 1)} />);
    expect(screen.getByRole("button", { name: /Balance/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Determination/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Aggression/ })).toBeDisabled();
    expect(screen.getByText("Conflicts won")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pass" })).toBeInTheDocument();
  });

  it("walks Balance from a source cube to a destination and sends the engine's own action", () => {
    const onAction = vi.fn();
    const props = boardProps(createInitialState(2, [null, "random"], 5), 0, 1, onAction);
    render(<GameBoard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Balance/ }));
    const source = screen.queryAllByRole("button", { name: /Your cube in/ })[0];
    if (source) fireEvent.click(source);
    const destination = screen.getAllByRole("button", { name: /March into|Swap up|Push out/ })[0];
    fireEvent.click(destination);
    expect(onAction).toHaveBeenCalledTimes(1);
    const sent = onAction.mock.calls[0][0];
    expect(props.legalActions.some((a) => canonicalEquals(a, sent))).toBe(true);
  });

  it("lets a tier-5 seat strike an enemy cube straight from the map", () => {
    const onAction = vi.fn();
    const props = boardProps(createInitialState(2, [null, "random"], 5), 0, 5, onAction);
    render(<GameBoard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Aggression/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /Strike the cube/ })[0]);
    expect(onAction.mock.calls[0][0]).toMatchObject({ type: "aggression" });
  });

  it("offers the Emperor a clan step before the reward kinds", () => {
    let state: GameState | null = null;
    for (let seed = 1; seed < 100 && !state; seed++) {
      const s = createInitialState(5, [null, "random", "random", "random", "random"], seed);
      if (s.players[0].clan === null) state = s;
    }
    if (!state) throw new Error("no Emperor seed");
    render(<GameBoard {...boardProps(state, 0, 5)} />);
    expect(screen.getByText("Emperor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Takeda/ }));
    expect(screen.getByRole("button", { name: /as 武田/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Aggression/ })).toBeEnabled();
  });
});

describe("GameBoard — tricks", () => {
  it("prompts the leader and plays the selected card only through the engine's action", () => {
    const onAction = vi.fn();
    const state = createInitialState(2, [null, "random"], 5);
    const view = buildPlayerView(state, 0);
    render(
      <GameBoard
        view={view}
        legalActions={getLegalActions(state)}
        isMyTurn
        isAiThinking={false}
        playerNames={[]}
        onAction={onAction}
      />,
    );
    expect(screen.getByText("Your turn")).toBeInTheDocument();
    expect(screen.getByText(/Lead a card/)).toBeInTheDocument();
    const [first] = screen.getAllByRole("img", { name: /of (Takeda|Uesugi|Oda|Mōri)|Ninja/ });
    fireEvent.click(first);
    fireEvent.click(screen.getByRole("button", { name: /^Play / }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ type: "play" });
  });
});
