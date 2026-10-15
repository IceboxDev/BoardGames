import { createInitialState } from "@boardgames/core/games/7-wonders/game-engine";
import {
  buildPlayerView,
  type SevenWondersPlayerView,
} from "@boardgames/core/games/7-wonders/machine";
import { getLegalActions } from "@boardgames/core/games/7-wonders/rules";
import type { CardId, GameState, SevenWondersAction } from "@boardgames/core/games/7-wonders/types";
import { cardIdName } from "@boardgames/core/games/7-wonders/types";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GameBoard from "./GameBoard";

let restore: (() => void) | null = null;

beforeEach(() => {
  sessionStorage.clear();
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

const ctx = (gameState: GameState) => ({
  gameState,
  strategies: [],
  humanPlayers: [0],
  pendingAiSelections: null,
});

function game(players = 3, edifice = false) {
  const state = createInitialState({ playerCount: players, seed: 11, sideMode: "A", edifice });
  return { state, view: buildPlayerView(ctx(state), 0) };
}

/** A hand card in the fan, by name (the face's title starts with it). */
function fanCard(id: CardId): HTMLElement {
  const faces = screen.getAllByTitle(new RegExp(`^${cardIdName(id)} — `));
  return faces[faces.length - 1];
}

/** The fixed row above the fan. */
function actionRow(): HTMLElement {
  const row = document.querySelector(".h-actions");
  if (!(row instanceof HTMLElement)) throw new Error("no action row");
  return row;
}

function renderBoard(
  view: SevenWondersPlayerView,
  legalActions: SevenWondersAction[],
  onAction = vi.fn(),
) {
  const utils = render(
    <GameBoard view={view} myIndex={0} legalActions={legalActions} onAction={onAction} />,
  );
  return { ...utils, onAction };
}

describe("7 Wonders GameBoard", () => {
  it("opens on your city, lists every city yours first, and switches views by key", () => {
    const { state, view } = game(4);
    renderBoard(view, getLegalActions(state, 0));
    const nav = screen.getByRole("navigation", { name: "Game views" });
    // Your city is the current view.
    expect(within(nav).getAllByRole("button", { current: "page" })[0]).toHaveTextContent("You");
    // Your left neighbour (seat 1) is marked.
    expect(within(nav).getByTitle("Your left neighbour")).toBeInTheDocument();
    expect(within(nav).getByTitle("Your right neighbour")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "1" });
    expect(within(nav).getByRole("button", { current: "page" })).toHaveTextContent("Table");
    fireEvent.keyDown(window, { key: "2" });
    expect(within(nav).getByRole("button", { current: "page" })).toHaveTextContent("Overview");
    fireEvent.keyDown(window, { key: "3" });
    expect(within(nav).getByRole("button", { current: "page" })).toHaveTextContent("Chains");
    // No Edifice: the cities follow at 4 (yours), then 5 — your left neighbour's.
    fireEvent.keyDown(window, { key: "5" });
    expect(screen.getByText("◂ your left")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "4" });
    expect(within(nav).getAllByRole("button", { current: "page" })[0]).toHaveTextContent("You");
  });

  it("keeps the action row to buttons — nothing until a card is picked up", () => {
    const { state, view } = game();
    renderBoard(view, getLegalActions(state, 0));
    expect(actionRow().textContent).toBe("");
    fireEvent.click(fanCard(view.me?.hand[0] ?? ""));
    const row = actionRow();
    expect(within(row).getByRole("button", { name: /^Discard/ })).toBeInTheDocument();
    // Every piece of text in the row sits inside a button.
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue;
      expect(n.parentElement?.closest("button")).not.toBeNull();
    }
  });

  it("builds with the only payment straight away, and Esc puts the card back", () => {
    const { view } = game();
    const card = view.me?.hand[0] ?? "";
    const legal: SevenWondersAction[] = [
      { type: "play-card", cardId: card, payment: { kind: "resources", left: 0, right: 0 } },
      { type: "discard", cardId: card },
    ];
    const { onAction } = renderBoard(view, legal);
    fireEvent.click(fanCard(card));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(actionRow().textContent).toBe("");
    fireEvent.click(fanCard(card));
    fireEvent.click(within(actionRow()).getByRole("button", { name: /^Build/ }));
    expect(onAction).toHaveBeenCalledWith(legal[0]);
  });

  it("asks how to pay when there is more than one way, cheapest first", () => {
    const { view } = game();
    const card = view.me?.hand[0] ?? "";
    const legal: SevenWondersAction[] = [
      { type: "play-card", cardId: card, payment: { kind: "resources", left: 2, right: 0 } },
      { type: "play-card", cardId: card, payment: { kind: "resources", left: 0, right: 1 } },
    ];
    const { onAction } = renderBoard(view, legal);
    fireEvent.click(fanCard(card));
    fireEvent.click(within(actionRow()).getByRole("button", { name: /^Build/ }));
    const dialog = screen.getByRole("dialog");
    const options = within(dialog)
      .getAllByRole("button")
      .filter((b) => /−\d/.test(b.textContent ?? ""));
    expect(options[0]).toHaveTextContent("−1");
    fireEvent.click(options[0]);
    expect(onAction).toHaveBeenCalledWith(legal[1]);
  });

  it("builds a wonder stage from the glowing slot, joining the Edifice when asked", () => {
    const { view } = game(3, true);
    const card = view.me?.hand[0] ?? "";
    const payment = { kind: "resources", left: 0, right: 0 } as const;
    const legal: SevenWondersAction[] = [
      { type: "build-wonder", cardId: card, payment },
      { type: "build-wonder", cardId: card, payment, participate: true },
    ];
    const { onAction } = renderBoard(view, legal);
    fireEvent.click(fanCard(card));
    fireEvent.click(within(actionRow()).getByRole("button", { name: /^Join/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Build wonder stage 1 with the selected card" }),
    );
    expect(onAction).toHaveBeenCalledWith({
      type: "build-wonder",
      cardId: card,
      payment,
      participate: true,
    });
  });

  it("wraps Babylon's seventh card and stamps the chosen card while you wait", () => {
    const { view } = game();
    const card = view.me?.hand[0] ?? "";
    const pending: SevenWondersPlayerView = {
      ...view,
      phase: "pending",
      pending: { kind: "babylon-seventh", playerIndex: 0 },
    };
    const legal: SevenWondersAction[] = [
      { type: "play-seventh", action: { type: "discard", cardId: card } },
    ];
    const { onAction, rerender } = renderBoard(pending, legal);
    fireEvent.click(fanCard(card));
    fireEvent.click(within(actionRow()).getByRole("button", { name: /^Discard/ }));
    expect(onAction).toHaveBeenCalledWith(legal[0]);

    // Back in the draft, picked and waiting: the card you sent is stamped.
    const waiting: SevenWondersPlayerView = {
      ...view,
      me: view.me ? { ...view.me, hasSelected: true } : null,
    };
    rerender(<GameBoard view={waiting} myIndex={0} legalActions={[]} onAction={onAction} />);
    expect(screen.getByText("Chosen")).toBeInTheDocument();
  });

  it("at game over keeps the action row, and opens the results on its own once", () => {
    vi.useFakeTimers();
    try {
      const { view } = game();
      const over: SevenWondersPlayerView = {
        ...view,
        phase: "game-over",
        me: view.me ? { ...view.me, hand: [] } : null,
      };
      const onShowResults = vi.fn();
      render(
        <GameBoard
          view={over}
          myIndex={0}
          legalActions={[]}
          onAction={vi.fn()}
          isGameOver
          onShowResults={onShowResults}
          autoShowResults
        />,
      );
      expect(within(actionRow()).getByRole("button", { name: "Final results" })).toBeEnabled();
      expect(onShowResults).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2000);
      expect(onShowResults).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks a hand card free only by the Statue of Zeus", () => {
    const { view } = game();
    const card = view.me?.hand[0];
    if (!card) throw new Error("no hand");
    renderBoard(view, [
      { type: "play-card", cardId: card, payment: { kind: "free-build" } },
      { type: "discard", cardId: card },
    ]);
    expect(screen.getByTitle("Free this turn by your Statue of Zeus")).toHaveTextContent("Free");
  });
});
