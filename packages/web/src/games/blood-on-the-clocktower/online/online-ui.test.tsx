import { nightQueue, nightStepId } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { BotcConfigSchema } from "@boardgames/core/games/blood-on-the-clocktower/manifest";
import type { OnlineAction } from "@boardgames/core/games/blood-on-the-clocktower/online/actions";
import { applyOnline } from "@boardgames/core/games/blood-on-the-clocktower/online/apply";
import {
  nextBotPlan,
  runBotPlan,
} from "@boardgames/core/games/blood-on-the-clocktower/online/bots";
import { createOnlineGame } from "@boardgames/core/games/blood-on-the-clocktower/online/create";
import type { BotcOnline } from "@boardgames/core/games/blood-on-the-clocktower/online/state";
import { viewFor } from "@boardgames/core/games/blood-on-the-clocktower/online/view";
import { bagCharacterReplacements } from "@boardgames/core/games/blood-on-the-clocktower/setup";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type BotcOnlineApi, BotcOnlineContext, stamp } from "./context";
import { PlayerScreen } from "./player/PlayerScreen";
import { StorytellerScreen } from "./storyteller/StorytellerScreen";

// The real reducer behind the real screens, in one process: a tiny "server"
// the screens send to, and a seat switch to look through each player's eyes.

function table() {
  let game = createOnlineGame({
    names: ["Story", "Ann", "Ben", "Cid", "Dee", "Eve", "Fin", "Gus"],
    config: BotcConfigSchema.parse({}),
    seed: 5,
  });
  const listeners = new Set<() => void>();
  const send = (seat: number, action: OnlineAction) => {
    const r = applyOnline(game, seat, action, Date.now());
    if (!r.ok) throw new Error(`${action.kind}: ${r.reason}`);
    game = r.game;
    for (const l of listeners) l();
  };
  const st = (action: Parameters<BotcOnlineApi["st"]>[0]) => send(0, stamp(action, game.rev));
  const store = {
    get: () => game,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  function Seat({ seat }: { seat: number }) {
    const g = useSyncExternalStore(store.subscribe, store.get);
    const api: BotcOnlineApi = {
      view: viewFor(g, seat),
      act: (a) => send(seat, a),
      st: (a) => send(seat, stamp(a, g.rev)),
      error: null,
      endActions: [],
    };
    return (
      <BotcOnlineContext.Provider value={api}>
        {seat === 0 ? <StorytellerScreen /> : <PlayerScreen />}
      </BotcOnlineContext.Provider>
    );
  }
  return { store, send, st, Seat, game: () => game as BotcOnline };
}

// A desk-sized screen: both rails sit beside the square (no phone sheet).
let restore: () => void = () => {};
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
afterEach(() => restore());

describe("the online screens", () => {
  it("wake the Fortune Teller, take their two picks, and show the Storyteller the true answer", () => {
    const t = table();
    // Make sure the bag holds a Fortune Teller, the way a Storyteller would.
    const bag = t.game().setup?.bag;
    if (bag && !bag.charactersInPlay.includes("fortune-teller")) {
      const from = bag.charactersInPlay.find((c) =>
        bagCharacterReplacements(bag, c).includes("fortune-teller"),
      );
      if (!from) throw new Error("no Townsfolk to swap");
      t.st({ kind: "setup-swap-token", from, to: "fortune-teller" });
    }
    t.st({ kind: "deal" });
    t.st({ kind: "reveal-characters" });
    for (let s = 1; s <= 7; s++) {
      t.send(s, { kind: "ack-character" });
      for (const d of t.game().inbox[s] ?? []) t.send(s, { kind: "dismiss-info", id: d.id });
    }
    t.st({ kind: "begin-night" });

    const state = t.game().companion;
    const queue = state ? nightQueue(state) : [];
    const step = queue.find((s) => s.kind === "wake" && s.character === "fortune-teller");
    if (!state || !step || step.kind !== "wake") throw new Error("the Fortune Teller doesn't wake");
    const fortuneTeller = state.players[step.seat]?.roomSeat ?? 0;
    t.st({ kind: "grimoire", action: { type: "moveNightCursor", delta: queue.indexOf(step) } });

    // The Storyteller wakes them.
    const stScreen = render(<t.Seat seat={0} />);
    fireEvent.click(screen.getByRole("button", { name: /^Wake / }));
    expect(t.game().wake?.stepId).toBe(nightStepId(step));
    stScreen.unmount();

    // On their screen: choose two players and send.
    const ft = render(<t.Seat seat={fortuneTeller} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Choose 2 players.")).toBeTruthy();
    const others = t.game().names.filter((_, i) => i > 0 && i !== fortuneTeller);
    fireEvent.click(within(dialog).getByRole("button", { name: others[0] }));
    fireEvent.click(within(dialog).getByRole("button", { name: others[1] }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    expect(t.game().wake?.choices[String(fortuneTeller)]?.seats).toHaveLength(2);
    ft.unmount();

    // Back at the Grimoire: their answer, and a YES/NO ready to show.
    render(<t.Seat seat={0} />);
    expect(screen.getByText(/chose/)).toBeTruthy();
    expect(screen.getByText(/^(YES|NO)$/)).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Show this" }));
    });
    const delivered = t.game().inbox[fortuneTeller]?.at(-1)?.payload;
    expect(delivered?.kind).toBe("yes-no");
  });

  it("names the part of the day, counts it down, and takes a player's Ready", () => {
    // Let the stand-in bots play to the first discussion, then look as Ann.
    let game = table().game();
    let now = Date.now() - 600_000;
    const everyone = game.names.map((_, i) => i);
    for (let beats = 0; beats < 2000 && game.day.timer?.kind !== "discussion"; beats++) {
      const plan = nextBotPlan(game, everyone);
      if (!plan) break;
      now = Math.max(now, plan.at);
      game = runBotPlan(game, plan, now).game;
    }
    expect(game.day.timer?.kind).toBe("discussion");
    // The countdown runs in real time from here.
    const timer = game.day.timer;
    if (!timer) throw new Error("no timer");
    const fresh = { ...timer, startedAt: Date.now(), endsAt: Date.now() + 60_000 };
    game = { ...game, day: { ...game.day, timer: fresh } };
    let current = game;
    const send = (seat: number, action: OnlineAction) => {
      const r = applyOnline(current, seat, action, Date.now());
      if (!r.ok) throw new Error(r.reason);
      current = r.game;
    };
    const api = (): BotcOnlineApi => ({
      view: viewFor(current, 1),
      act: (a) => send(1, a),
      st: () => {},
      error: null,
      endActions: [],
    });
    const screenOf = () => (
      <BotcOnlineContext.Provider value={api()}>
        <PlayerScreen />
      </BotcOnlineContext.Provider>
    );
    const { rerender } = render(screenOf());

    const track = screen.getByTestId("phase-track");
    expect(track.dataset.part).toBe("discussion");
    expect(track.querySelector("[aria-current=step]")?.textContent).toMatch(/Discussion/);
    expect(within(track).getByText(/^[01]:\d\d$/)).toBeTruthy();
    // The day is announced, with the night's news.
    expect(screen.getByRole("status").textContent).toMatch(/Day 1/);

    // The bar's buttons sit in its centre column.
    const bar = screen.getByTestId("game-action-bar");
    const readyButton = within(bar).getByRole("button", { name: "Ready for nominations" });
    expect(readyButton.parentElement?.className).toContain("justify-center");
    fireEvent.click(readyButton);
    expect(current.day.ready).toEqual([1]);
    rerender(screenOf());
    expect(within(bar).getByRole("button", { name: "✓ Ready" })).toBeTruthy();
  });
});
