import { createInitialState } from "@boardgames/core/games/the-hunger/game-engine";
import { buildPlayerView } from "@boardgames/core/games/the-hunger/player-view";
import { getLegalActions } from "@boardgames/core/games/the-hunger/rules";
import {
  act,
  afterSetup,
  emptyTrack,
  rigTurn,
} from "@boardgames/core/games/the-hunger/test-helpers";
import type { GameState } from "@boardgames/core/games/the-hunger/types";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

function props(state: GameState, onAction = vi.fn()) {
  const seat = state.current?.player ?? 0;
  return {
    view: buildPlayerView(state, seat),
    legalActions: getLegalActions(state, seat),
    isMyTurn: true,
    isAiThinking: false,
    playerNames: [],
    onAction,
  };
}

const speedy = ["vampiric-speed-3#0", "vampiric-speed-3#1", "vampire-speed-2#0-0"];

describe("GameBoard", () => {
  it("asks for the starting Mission and sends the kept tile", () => {
    const state = createInitialState({ playerCount: 2, strategies: [null, null], seed: 3 });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction)} />);
    expect(screen.getByText("Keep one Mission")).toBeInTheDocument();
    // The dialog lists the tiles alphabetically.
    const [first] = [...state.setupOffers[0]].sort();
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: /Keep 1\/1/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "keep-missions", keep: [first] });
  });

  it("offers glowing destinations on the map while moving", () => {
    const state = rigTurn(afterSetup(2, 7), 0, { hand: speedy, pos: "road-3" });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /Move to .*\(road-4\) for 1 Speed/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "move", to: "road-4", spent: 1 });
  });

  it("hunts a pile from the Hunt Track", () => {
    const track = emptyTrack();
    track[0][0] = ["mindy#0"];
    let state = rigTurn(afterSetup(2, 7), 0, { hand: speedy, pos: "road-4", track });
    state = act(state, { type: "stay" });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /Hunt Mindy for 1 Speed/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "hunt", row: 0, col: 0 });
  });

  it("resolves a discard/draw effect by picking its source, then its target", () => {
    const state = rigTurn(afterSetup(2, 7), 0, {
      hand: ["vampiric-will#0", "theresa#0", "vampire-speed-2#0-0"],
      pos: "road-4",
    });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction)} />);
    expect(screen.getByText(/resolve draw \/ discard effects/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Vampiric Will/ }));
    expect(screen.getByText("pick the card to discard")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Theresa/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "resolve",
      card: "vampiric-will#0",
      discard: "theresa#0",
    });
  });

  it("arms a targeted Instant Mission, then fires it at the chosen chest", () => {
    const base = afterSetup(2, 7);
    base.players[0].missions = ["treasure-chest"];
    base.chests["boat-10"] = "velvet#0";
    const state = rigTurn(base, 0, { hand: speedy, pos: "road-4" });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /^Treasure Chest/ }));
    expect(screen.getByText(/click a chest on the map/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Take the Bonus token at .*\(boat-10\)/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "instant",
      mission: "treasure-chest",
      space: "boat-10",
    });
  });

  it("fires an untargeted Instant Mission at once", () => {
    const base = afterSetup(2, 7);
    base.players[0].missions = ["the-opportunist"];
    base.players[1].pos = "road-1";
    const state = rigTurn(base, 0, { hand: speedy, pos: "road-6" });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /^The Opportunist/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "instant", mission: "the-opportunist" });
  });

  it("hands the pushed Vampire a Nanny dialog on the pusher's turn", () => {
    const b = afterSetup(2, 7);
    b.players[1].pos = "road-5";
    b.players[1].playArea = [
      { id: "tyson#0", resolved: false },
      { id: "chop#0", resolved: false },
    ];
    let state = rigTurn(b, 0, { hand: speedy, pos: "road-3", permanent: ["nanny#0"] });
    state = act(state, { type: "move", to: "road-5", spent: 2 });
    state = act(state, { type: "push", to: "road-6" });
    const onAction = vi.fn();
    // Seat 1's screen.
    render(
      <GameBoard
        view={buildPlayerView(state, 1)}
        legalActions={getLegalActions(state, 1)}
        isMyTurn
        isAiThinking={false}
        playerNames={[]}
        onAction={onAction}
      />,
    );
    expect(screen.getByText("Discard one of your Permanent cards")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard Chop" }));
    expect(onAction).toHaveBeenCalledWith({ type: "discard-permanent", card: "chop#0" });
  });

  it("uses Wiggles by clicking it, then the card it digests", () => {
    const state = rigTurn(afterSetup(2, 7), 0, {
      hand: ["theresa#0", "vampire-speed-2#0-0", "vampire-speed-3#0-0"],
      pos: "road-4",
      permanent: ["wiggles#0"],
    });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /^Wiggles/ }));
    expect(screen.getByText(/Wiggles: pick a card to digest with it/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Theresa/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "familiar",
      card: "wiggles#0",
      target: "theresa#0",
    });
  });

  it("Hypnosis: click the card, a Hunt Track card, then its direction", () => {
    const track = emptyTrack();
    track[0][1] = ["o-nel#0"];
    const state = rigTurn(afterSetup(2, 7), 0, {
      hand: ["hypnosis#0", "vampiric-speed-3#0", "vampiric-speed-2#0"],
      pos: "road-4",
      track,
    });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: /^Hypnosis/ }));
    expect(screen.getByText(/click a card on the Hunt Track/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hypnotise O'Nel" }));
    fireEvent.click(screen.getByRole("button", { name: "→ column 1" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "hypnosis",
      card: "hypnosis#0",
      pick: "o-nel#0",
      row: 0,
      col: 0,
    });
  });

  it("hovering a Hunt Track card shows the full card with its rules text", async () => {
    const track = emptyTrack();
    track[0][0] = ["zephania#0"];
    const state = rigTurn(afterSetup(2, 7), 0, { hand: speedy, pos: "road-4", track });
    render(<GameBoard {...props(state)} />);
    const row = screen.getAllByText("Zephania")[0];
    fireEvent.mouseEnter(row.closest("[class*='border-l-4']") as Element);
    // The preview is the full face, carrying the card's own text.
    expect(
      await screen.findByTitle(/^Zephania — Religious: When you hunt this card/),
    ).toBeInTheDocument();
  });

  it("keeps Done disabled until a mandatory draw has been resolved", () => {
    const state = rigTurn(afterSetup(2, 7), 0, {
      hand: ["dee#0", "vampiric-speed-3#0", "vampiric-speed-2#0"],
      pos: "road-4",
    });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction)} />);
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    expect(screen.getByText(/Dee must draw first/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Dee/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "resolve", card: "dee#0" });
  });

  it("lets you look through your own discard pile", () => {
    const base = afterSetup(2, 7);
    base.players[0].discard = ["theresa#0", "ivo#0"];
    const state = rigTurn(base, 0, { hand: speedy, pos: "road-4" });
    render(<GameBoard {...props(state)} />);
    const toggle = screen.getByRole("button", { name: /Your discard pile \(2\)/ });
    const panel = toggle.parentElement as HTMLElement;
    expect(within(panel).queryAllByText("Theresa")).toHaveLength(0);
    fireEvent.click(toggle);
    expect(within(panel).getAllByText("Theresa").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Ivo").length).toBeGreaterThan(0);
  });
});
