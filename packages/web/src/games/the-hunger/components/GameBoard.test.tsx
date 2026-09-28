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
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewId } from "../logic/attention";
import GameBoard from "./GameBoard";

let restore: (() => void) | null = null;

beforeEach(() => {
  sessionStorage.clear();
  // The choice overlays portal into the app's content area, as in the real layout.
  const main = document.createElement("main");
  main.id = "app-main";
  document.body.appendChild(main);
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
  document.getElementById("app-main")?.remove();
  vi.restoreAllMocks();
});

function props(state: GameState, onAction = vi.fn(), initialView: ViewId = "map") {
  const seat = state.current?.player ?? 0;
  return {
    initialView,
    view: buildPlayerView(state, seat),
    legalActions: getLegalActions(state, seat),
    isMyTurn: true,
    isAiThinking: false,
    playerNames: [],
    onAction,
  };
}

/** A map target by its space — `data-space` is an internal test hook, never shown. */
function mapTarget(space: string): Element {
  const el = document.querySelector(`[data-space="${space}"]`);
  if (!el) throw new Error(`no map target for ${space}`);
  return el;
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
    const target = mapTarget("road-4");
    expect(target.getAttribute("aria-label")).toBe("Move to Plains Chest for 1 Speed");
    fireEvent.click(target);
    expect(onAction).toHaveBeenCalledWith({ type: "move", to: "road-4", spent: 1 });
  });

  it("hunts a pile from the Hunt Track", () => {
    const track = emptyTrack();
    track[0][0] = ["mindy#0"];
    let state = rigTurn(afterSetup(2, 7), 0, { hand: speedy, pos: "road-4", track });
    state = act(state, { type: "stay" });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction, "shop")} />);
    fireEvent.click(screen.getByRole("button", { name: /Hunt Mindy for 1 Speed/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "hunt", row: 0, col: 0 });
  });

  it("resolves a discard/draw effect by picking its source, then its target", () => {
    const state = rigTurn(afterSetup(2, 7), 0, {
      hand: ["vampiric-will#0", "theresa#0", "vampire-speed-2#0-0"],
      pos: "road-4",
    });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction, "player")} />);
    // The action bar holds buttons only: Done to finish step 1, Cancel once a card is armed.
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /^Vampiric Will/ }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    const target = mapTarget("boat-10");
    expect(target.getAttribute("aria-label")).toBe("Take the Bonus token at Forest Chest");
    fireEvent.click(target);
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
    expect(screen.getByText("Give up one Permanent card")).toBeInTheDocument();
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
    render(<GameBoard {...props(state, onAction, "player")} />);
    fireEvent.click(screen.getByRole("button", { name: /^Wiggles/ }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Theresa/ }));
    expect(onAction).toHaveBeenCalledWith({
      type: "familiar",
      card: "wiggles#0",
      target: "theresa#0",
    });
  });

  it("Hypnosis: the card takes you to the Hunt, then a card and the pile it moves to", () => {
    const track = emptyTrack();
    track[0][1] = ["o-nel#0"];
    const state = rigTurn(afterSetup(2, 7), 0, {
      hand: ["hypnosis#0", "vampiric-speed-3#0", "vampiric-speed-2#0"],
      pos: "road-4",
      track,
    });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction, "player")} />);
    fireEvent.click(screen.getByRole("button", { name: /^Hypnosis/ }));
    // Clicking the card is the action: the Hunt opens on its own.
    const nav = screen.getByRole("navigation", { name: "Game views" });
    expect(within(nav).getByRole("button", { name: /Hunt/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // One Cancel, and no arrow buttons in the bar.
    expect(screen.getAllByRole("button", { name: /^Cancel/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Hypnotise O'Nel" }));
    expect(screen.queryByRole("button", { name: /column 1/ })).toBeNull();
    // The neighbouring piles light up; the destination is clicked on the track.
    const targets = screen.getAllByRole("button", { name: /^Move the Hypnotised card here/ });
    expect(targets.length).toBeGreaterThan(0);
    fireEvent.click(targets[0]);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "hypnosis", card: "hypnosis#0", pick: "o-nel#0" }),
    );
  });

  it("uses Ursa by clicking the card on your board, not a bar button", () => {
    const state = rigTurn(afterSetup(2, 7), 0, {
      hand: ["vampire-speed-2#0-0", "vampire-speed-3#0-0", "vampire-thirst#0-0"],
      pos: "road-4",
      permanent: ["ursa#0"],
    });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction, "player")} />);
    expect(screen.queryByRole("button", { name: /new hand/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Ursa/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "familiar", card: "ursa#0" });
  });

  it("asks how many to draw when a 'may draw' card allows more than one", () => {
    const state = rigTurn(afterSetup(2, 7), 0, {
      hand: ["vampiric-strength#0", "mindy#0", "vampire-speed-2#0-0"],
      pos: "road-4",
    });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction, "player")} />);
    fireEvent.click(screen.getByRole("button", { name: /^Vampiric Strength/ }));
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Draw 1" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "resolve",
      card: "vampiric-strength#0",
      draw: 1,
    });
  });

  it("offers a Gain 1 Mission token found mid-turn as a button in the action bar", () => {
    const b = afterSetup(2, 7);
    b.players[0].bonus = [{ id: "mission#0", used: false }];
    let state = rigTurn(b, 0, { hand: speedy, pos: "road-4" });
    state = act(state, { type: "end-manipulation" });
    state = act(state, { type: "stay" });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: "Gain 1 Mission" }));
    expect(onAction).toHaveBeenCalledWith({ type: "use-bonus", token: "mission#0" });
  });

  it("hovering a Hunt Track card shows the big card, its kind spelled out", async () => {
    const track = emptyTrack();
    track[0][0] = ["zephania#0"];
    const state = rigTurn(afterSetup(2, 7), 0, { hand: speedy, pos: "road-4", track });
    render(<GameBoard {...props(state, vi.fn(), "shop")} />);
    const title = /^Zephania — Religious: When you hunt this card/;
    expect(screen.getAllByTitle(title)).toHaveLength(1);
    fireEvent.mouseEnter(screen.getAllByText("Zephania")[0].closest("[class='h-full']") as Element);
    // The preview is the showcase face: the kind is spelled out only there.
    expect(screen.queryByText("religious Human")).toBeNull();
    await waitFor(() => expect(screen.getByText("religious Human")).toBeInTheDocument());
  });

  it("keeps Done disabled until a mandatory draw has been resolved", () => {
    const state = rigTurn(afterSetup(2, 7), 0, {
      hand: ["dee#0", "vampiric-speed-3#0", "vampiric-speed-2#0"],
      pos: "road-4",
    });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction, "player")} />);
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute(
      "title",
      expect.stringMatching(/Dee must draw first/),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Dee/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "resolve", card: "dee#0" });
  });

  it("lets you look through your own discard pile", () => {
    const base = afterSetup(2, 7);
    base.players[0].discard = ["theresa#0", "ivo#0"];
    const state = rigTurn(base, 0, { hand: speedy, pos: "road-4" });
    render(<GameBoard {...props(state, vi.fn(), "player")} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Discard pile: 2 cards/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByText("Theresa").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("Ivo").length).toBeGreaterThan(0);
  });

  it("opens your draw pile face up, sorted, never in deck order", () => {
    const base = afterSetup(2, 7);
    base.players[0].deck = ["theresa#0", "chop#0", "ivo#0"];
    const state = rigTurn(base, 0, { hand: speedy, pos: "road-4" });
    render(<GameBoard {...props(state, vi.fn(), "player")} />);
    fireEvent.click(screen.getByRole("button", { name: /^Draw pile: 3 cards/ }));
    const dialog = screen.getByRole("dialog");
    for (const name of ["Theresa", "Chop", "Ivo"]) {
      expect(within(dialog).getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  it("shows Undo when the server offers it, and sends it", () => {
    const state = rigTurn(afterSetup(2, 7), 0, { hand: speedy, pos: "road-3" });
    const onAction = vi.fn();
    const base = props(state, onAction);
    render(<GameBoard {...base} legalActions={[...base.legalActions, { type: "undo" }]} />);
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    expect(onAction).toHaveBeenCalledWith({ type: "undo" });
  });

  it("labels an open Chest on the map with its bonus", () => {
    const b = afterSetup(2, 7);
    b.chests["road-8"] = "parasol#0";
    const state = rigTurn(b, 0, { hand: speedy, pos: "road-3" });
    render(<GameBoard {...props(state)} />);
    expect(screen.getByText("☂ Parasol")).toBeInTheDocument();
  });

  it("offers every Crypt pile, on the map and by name, when a Mission is gained", () => {
    const track = emptyTrack();
    track[0][0] = ["wright#0"];
    let state = rigTurn(afterSetup(2, 7), 0, { hand: speedy, pos: "road-4", track });
    state = act(state, { type: "stay" });
    state = act(state, { type: "hunt", row: 0, col: 0 });
    const onAction = vi.fn();
    render(<GameBoard {...props(state, onAction)} />);
    const left = state.crypts["rail-9"].length;
    expect(screen.getByRole("button", { name: `Forest Crypt · ${left} left` })).toBeInTheDocument();
    const crypt = mapTarget("rail-9");
    expect(crypt.getAttribute("aria-label")).toBe(
      `Take a Mission from Forest Crypt (${left} left)`,
    );
    fireEvent.click(crypt);
    expect(onAction).toHaveBeenCalledWith({ type: "inspire", crypt: "rail-9" });
  });

  it.each<ViewId>([
    "map",
    "player",
    "shop",
    "overview",
  ])("never shows a space id in the %s view: no text, label or tooltip names one", (initial) => {
    const b = afterSetup(2, 7);
    b.players[1].pos = "road-5";
    let state = rigTurn(b, 0, { hand: speedy, pos: "road-3" });
    state = act(state, { type: "move", to: "road-4", spent: 1 });
    render(<GameBoard {...props(state, vi.fn(), initial)} />);
    const id = /\b(road|rail|boat|castle|cemetery|labyrinth|mountains|plains|forest)-\d+\b/;
    const shown = [
      document.body.textContent ?? "",
      ...[...document.querySelectorAll("[aria-label], [title]")].flatMap((el) => [
        el.getAttribute("aria-label") ?? "",
        el.getAttribute("title") ?? "",
      ]),
    ];
    expect(shown.filter((t) => id.test(t))).toEqual([]);
  });

  it("pulses the view that needs you, and switches views with the number keys", () => {
    const track = emptyTrack();
    track[0][0] = ["mindy#0"];
    let state = rigTurn(afterSetup(2, 7), 0, { hand: speedy, pos: "road-4", track });
    state = act(state, { type: "stay" });
    render(<GameBoard {...props(state)} />);
    const nav = screen.getByRole("navigation", { name: "Game views" });
    const hunt = within(nav).getByRole("button", { name: /Hunt/ });
    expect(within(hunt).getByLabelText("needs your attention")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "2" });
    expect(within(nav).getByRole("button", { name: /Hunt/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: /Hunt Mindy for 1 Speed/ })).toBeInTheDocument();
  });

  it("compares every Vampire on the Overview", () => {
    const state = rigTurn(afterSetup(3, 7), 0, { hand: speedy, pos: "road-4" });
    render(<GameBoard {...props(state, vi.fn(), "overview")} />);
    for (const row of [
      "Victory Points",
      "Steps to the Castle",
      "Expected Speed",
      "Missions held",
    ]) {
      expect(screen.getByText(row)).toBeInTheDocument();
    }
  });
});
