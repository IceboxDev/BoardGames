// The five upgrades from the 2026-09 playtest, pinned at the React level:
// seating a traveller anywhere, undo / back to the night, the vote tally
// stepper, recording what was told, and icons + hand-over mode.

import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  beginNight,
  createGame,
  dawn,
  endDay,
  kill,
  moveNightCursor,
  nightQueue,
  setButlerMaster,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import type { GameSetup } from "@boardgames/core/games/blood-on-the-clocktower/setup";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryActions } from "./Companion";
import CompanionGame from "./CompanionGame";
import { SeatPicker } from "./common";
import GrimoirePanel from "./GrimoirePanel";
import NightPanel from "./night/NightPanel";
import { PrivacyProvider } from "./privacy";

vi.mock("../../../hooks/useCurrentUser.ts", () => ({
  useCurrentUser: () => ({ user: null, isLoading: false, isAdmin: false }),
}));

// The town square places its seats once its surface is measured. jsdom
// measures nothing, so the observer reports a phone-sized square.
beforeEach(() => {
  window.ResizeObserver = class {
    readonly #report: ResizeObserverCallback;
    constructor(report: ResizeObserverCallback) {
      this.#report = report;
    }
    observe() {
      const entry = { contentRect: { width: 360, height: 360 } } as ResizeObserverEntry;
      this.#report([entry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const NAMES = ["Alice", "Bob", "Cara", "Dan", "Eve", "Finn", "Gwen", "Hana"];

function game(edition: "trouble-brewing" | "bad-moon-rising", chars: CharacterId[]) {
  const setup: GameSetup = {
    edition,
    seats: chars.map((character, seat) => ({ seat, name: NAMES[seat], character })),
    distribution: { townsfolk: 5, outsiders: 0, minions: 1, demons: 1 },
    demonBluffs:
      edition === "bad-moon-rising"
        ? ["innkeeper", "courtier", "gossip"]
        : ["chef", "slayer", "saint"],
  };
  return beginNight(createGame(setup));
}

// seat 0 Imp, 1 Poisoner, 2 Empath, 3 Butler, 4 Monk, 5 Undertaker, 6 Soldier
const tb = () =>
  game("trouble-brewing", ["imp", "poisoner", "empath", "butler", "monk", "undertaker", "soldier"]);

function Host({
  initial,
  history,
  handOver = false,
}: {
  initial: CompanionState;
  history?: HistoryActions;
  handOver?: boolean;
}) {
  const [state, setState] = useState(initial);
  return (
    <CompanionGame
      state={state}
      update={(fn) => setState((s) => fn(s))}
      history={history}
      onAbandon={() => {}}
      initialHandOver={handOver}
    />
  );
}

describe("1 · seating a traveller anywhere", () => {
  it("offers 'after whom' and seats the newcomer between the chosen neighbours", () => {
    function Grimoire() {
      const [state, setState] = useState(dawn(tb()));
      return <GrimoirePanel state={state} update={(fn) => setState((s) => fn(s))} />;
    }
    render(<Grimoire />);
    fireEvent.change(screen.getByLabelText("Traveller's name"), { target: { value: "Ivy" } });
    const where = screen.getByLabelText("Sits after");
    expect(
      within(where).getByRole("option", { name: "After Cara — before Dan" }),
    ).toBeInTheDocument();
    fireEvent.change(where, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Joins town" }));
    const rows = screen.getAllByText(/^\d+\. /).map((el) => el.textContent);
    expect(rows.slice(0, 5)).toEqual(["1. Alice", "2. Bob", "3. Cara", "4. Ivy", "5. Dan"]);
  });
});

describe("2 · undo and back to the night", () => {
  it("the header offers Undo with the last log line, and the dawn recap offers 'Back to the night'", () => {
    const undo = vi.fn();
    const backToNight = vi.fn();
    const history: HistoryActions = {
      canUndo: true,
      canRedo: false,
      undoLabel: "Dawn breaks — nobody died tonight.",
      canBackToNight: true,
      undo,
      redo: vi.fn(),
      backToNight,
    };
    render(<Host initial={dawn(tb())} history={history} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Undo: Dawn breaks — nobody died tonight." }),
    );
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "← Back to the night" }));
    expect(backToNight).toHaveBeenCalledTimes(1);
  });
});

describe("3 · nominating on the table and counting hand by hand", () => {
  const up = () => fireEvent.click(screen.getByRole("button", { name: "✋ Hand up" }));
  const down = () => fireEvent.click(screen.getByRole("button", { name: "Hand down" }));
  const back = () => fireEvent.click(screen.getByRole("button", { name: "← Back one hand" }));

  it("counts one hand at a time clockwise from the nominee, and books the tally with tokens spent", () => {
    let s = dawn(tb());
    s = kill(s, 5, "storyteller"); // Finn is dead with a ghost vote
    s = setButlerMaster(s, 3, 2); // Dan the Butler follows Cara
    render(<Host initial={s} />);
    fireEvent.click(screen.getByRole("button", { name: "Alice" })); // nominator
    fireEvent.click(screen.getByRole("button", { name: "Bob" })); // nominee
    fireEvent.click(screen.getByRole("button", { name: "Start the count →" }));
    // The vote has the screen: the day's other panels step aside.
    expect(screen.queryByRole("button", { name: /night falls/ })).toBeNull();
    // Clockwise from Bob's left: Cara, Dan, Eve, Finn, Gwen, Alice, Bob.
    const strip = screen.getByRole("list", { name: "Counting order" });
    expect(
      within(strip)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Cara", "Dan", "Eve", "Finn", "Gwen", "Alice", "Bob"]);
    expect(screen.getByText("Hand 1 of 7")).toBeInTheDocument();
    down(); // Cara
    // Dan's hand alone counts nothing: the Butler needs Cara.
    expect(screen.getByText("Butler · counts only if Cara voted")).toBeInTheDocument();
    up(); // Dan
    expect(within(strip).getByLabelText("Dan: hand up")).toBeInTheDocument();
    back();
    back();
    up(); // Cara
    up(); // Dan
    up(); // Eve
    expect(screen.getByText("Ghost vote: raising it spends it")).toBeInTheDocument();
    up(); // Finn
    down(); // Gwen
    down(); // Alice
    expect(screen.getByText("The nominee, counted last")).toBeInTheDocument();
    down(); // Bob
    fireEvent.click(screen.getByRole("button", { name: /Record 4 votes on Bob/ }));
    expect(screen.getByText(/is about to die with 4 votes/)).toBeInTheDocument();
    // Finn's ghost vote is spent: the next count skips them.
    fireEvent.click(screen.getByRole("button", { name: "Cara" }));
    fireEvent.click(screen.getByRole("button", { name: "Eve" }));
    fireEvent.click(screen.getByRole("button", { name: "Start the count →" }));
    expect(screen.getByLabelText("Finn: no vote")).toBeInTheDocument();
    expect(screen.getByText("Hand 1 of 6")).toBeInTheDocument();
    // A laptop at the table answers with the arrow keys.
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Hand 2 of 6")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel the count" }));
    expect(screen.getByRole("button", { name: /night falls/ })).toBeInTheDocument();
  });

  it("can still be counted by hand", () => {
    render(<Host initial={dawn(tb())} />);
    fireEvent.click(screen.getByRole("button", { name: "Alice" }));
    fireEvent.click(screen.getByRole("button", { name: "Bob" }));
    fireEvent.click(screen.getByRole("button", { name: "Count by hand" }));
    fireEvent.click(screen.getByRole("button", { name: "One vote more" }));
    fireEvent.click(screen.getByRole("button", { name: "One vote more" }));
    fireEvent.click(screen.getByRole("button", { name: /Record 2 votes on Bob/ }));
    // Booked: Bob can no longer be nominated today.
    fireEvent.click(screen.getByRole("button", { name: "Cara" }));
    expect(screen.queryByRole("button", { name: "Bob" })).toBeNull();
    expect(screen.getByRole("figure", { name: "Bob" })).toBeInTheDocument();
  });
});

describe("4 · recording what was told", () => {
  it("the Empath's true number has a 'told' stepper that books the lie next to the truth", () => {
    let s = endDay(dawn(tb()));
    const at = nightQueue(s).findIndex((x) => x.kind === "wake" && x.character === "empath");
    s = moveNightCursor(s, at);
    function Night() {
      const [state, setState] = useState(s);
      return (
        <>
          <NightPanel state={state} update={(fn) => setState((x) => fn(x))} />
          <output data-testid="told">{JSON.stringify(state.players[2].infoGiven)}</output>
        </>
      );
    }
    render(<Night />);
    fireEvent.click(screen.getByRole("button", { name: "One more" }));
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(screen.getByText(/Recorded — told 2 \(true: 1\)/)).toBeInTheDocument();
    expect(screen.getByTestId("told")).toHaveTextContent('[{"night":2,"told":"2","truth":"1"}]');
  });
});

describe("5 · icons and hand-over mode", () => {
  it("seat chips carry the token art, and drop it (and the label) in hand-over mode", () => {
    const s = tb();
    const { rerender } = render(
      <PrivacyProvider key="storyteller" initial={false}>
        <SeatPicker state={s} selected={[]} onToggle={() => {}} showCharacters />
      </PrivacyProvider>,
    );
    const alice = screen.getByRole("button", { name: "AliceImp" });
    expect(alice.querySelector("img")).not.toBeNull();
    expect(alice).toHaveTextContent("Imp");
    rerender(
      <PrivacyProvider key="player" initial>
        <SeatPicker state={s} selected={[]} onToggle={() => {}} showCharacters />
      </PrivacyProvider>,
    );
    const hidden = screen.getByRole("button", { name: "Alice" });
    expect(hidden.querySelector("img")).toBeNull();
    expect(hidden).not.toHaveTextContent("Imp");
  });

  it("in hand-over mode a player sees no roles — not the Butler's rule, not the secret-role day panels", () => {
    let s = dawn(tb());
    s = setButlerMaster(s, 3, 2);
    render(<Host initial={s} handOver />);
    fireEvent.click(screen.getByRole("button", { name: "Alice" }));
    fireEvent.click(screen.getByRole("button", { name: "Bob" }));
    fireEvent.click(screen.getByRole("button", { name: "Start the count →" }));
    // No token art in the strip, and Dan's turn names no Butler rule.
    expect(screen.getByRole("list", { name: "Counting order" }).querySelector("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hand down" })); // Cara
    expect(screen.getByText("Hand 2 of 7")).toBeInTheDocument(); // Dan
    expect(screen.queryByText(/Butler/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel the count" }));
    expect(screen.queryByText(/Judge's ruling|may make one public statement/)).toBeNull();
  });

  it("the eye hides the Grimoire, hints and the New-game button until toggled back", () => {
    render(<Host initial={dawn(tb())} />);
    fireEvent.click(screen.getByRole("button", { name: "Hide roles to hand the phone over" }));
    expect(screen.getByText(/Hand-over mode/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New game" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Grimoire" }));
    expect(screen.getByText(/The Grimoire is hidden in hand-over mode/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show roles again (phone is back)" }));
    expect(screen.getByText("Storyteller's eyes only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New game" })).toBeInTheDocument();
  });
});
