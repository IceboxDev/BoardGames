import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  beginNight,
  createGame,
  dawn,
  endDay,
  moveNightCursor,
  nightQueue,
  recordDemonKill,
  recordGamblerGuess,
  recordNomination,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import type { GameSetup } from "@boardgames/core/games/blood-on-the-clocktower/setup";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../../../components/ui";
import CompanionGame from "./CompanionGame";
import NightPanel from "./night/NightPanel";

vi.mock("../../../hooks/useCurrentUser.ts", () => ({
  useCurrentUser: () => ({ user: null, isLoading: false, isAdmin: false }),
}));

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

const goTo = (s: CompanionState, character: CharacterId) => {
  const at = nightQueue(s).findIndex((x) => x.kind === "wake" && x.character === character);
  if (at === -1) throw new Error(`no ${character} step`);
  return moveNightCursor(s, at);
};

/** A tiny host that applies reducers like the store does. */
function Harness({
  initial,
  Component,
}: {
  initial: CompanionState;
  Component: typeof NightPanel;
}) {
  const [state, setState] = useState(initial);
  return <Component state={state} update={(fn) => setState((s) => fn(s))} />;
}

describe("the night wizard reads its progress from state", () => {
  it("still offers the Zombuul's attack after the Gambler died on their guess", () => {
    let s = endDay(
      dawn(
        game("bad-moon-rising", [
          "zombuul",
          "gambler",
          "sailor",
          "chambermaid",
          "goon",
          "courtier",
          "assassin",
        ]),
      ),
    );
    s = goTo(s, "gambler");
    s = recordGamblerGuess(s, 1, 2, "innkeeper"); // wrong → Bob dies
    s = moveNightCursor(s, 1); // the Zombuul
    render(<Harness initial={s} Component={NightPanel} />);
    expect(screen.getByText(/Wake/)).toHaveTextContent("Alice");
    expect(screen.queryByText(/Kill recorded/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dan" }));
    fireEvent.click(screen.getByRole("button", { name: "Dan dies" }));
    expect(screen.getByText(/Kill recorded/)).toBeInTheDocument();
  });

  it("the Shabaloth's second pick survives a trip to the Grimoire tab; a third is never offered", () => {
    let s = endDay(
      dawn(
        game("bad-moon-rising", [
          "shabaloth",
          "godfather",
          "sailor",
          "chambermaid",
          "innkeeper",
          "tea-lady",
          "fool",
          "gossip",
        ]),
      ),
    );
    s = goTo(s, "shabaloth");
    s = recordDemonKill(s, 3, "dies"); // first pick: Dan
    function Host() {
      const [state, setState] = useState(s);
      return (
        <CompanionGame state={state} update={(fn) => setState((x) => fn(x))} onAbandon={() => {}} />
      );
    }
    render(<Host />);
    expect(screen.getByText(/1\/2 resolved/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Grimoire" }));
    expect(screen.getByText("Storyteller's eyes only")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Night 2/ }));
    // Back on the step: still one of two, Dan no longer offered.
    expect(screen.getByText(/1\/2 resolved/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dan" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Hana" }));
    fireEvent.click(screen.getByRole("button", { name: "Hana dies" }));
    expect(screen.getByText(/Both picks resolved/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eve" })).toBeNull();
  });

  it("Back / Next move the cursor through the reducer so a remount lands on the same step", () => {
    const s = endDay(
      dawn(
        game("trouble-brewing", [
          "imp",
          "poisoner",
          "empath",
          "fortune-teller",
          "monk",
          "undertaker",
          "soldier",
        ]),
      ),
    );
    function Host() {
      const [state, setState] = useState(s);
      const [mounted, setMounted] = useState(true);
      return (
        <>
          <Button variant="ghost" onClick={() => setMounted((m) => !m)}>
            toggle
          </Button>
          {mounted && <NightPanel state={state} update={(fn) => setState((x) => fn(x))} />}
        </>
      );
    }
    render(<Host />);
    expect(screen.getByText(/Step 1 \//)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(screen.getByText(/Step 3 \//)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByText(/Step 3 \//)).toBeInTheDocument();
  });
});

describe("the day tracker renders core's verdicts", () => {
  it("shows last night's toll from state, and the Saint warning before an execution", () => {
    let s = game("trouble-brewing", [
      "imp",
      "poisoner",
      "empath",
      "fortune-teller",
      "monk",
      "undertaker",
      "saint",
    ]);
    s = recordDemonKill(s, 2, "dies");
    s = dawn(s);
    s = recordNomination(s, 3, 6, 3);
    function Host() {
      const [state, setState] = useState(s);
      return (
        <CompanionGame state={state} update={(fn) => setState((x) => fn(x))} onAbandon={() => {}} />
      );
    }
    render(<Host />);
    expect(screen.getByText(/Dawn breaks — died tonight: Cara/)).toBeInTheDocument();
    expect(screen.getByText(/They are the SAINT/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Execute Gwen" }));
    expect(screen.getByText("Evil wins!")).toBeInTheDocument();
    expect(screen.getByText("the Saint was executed")).toBeInTheDocument();
  });
});
