// The Lunatic's wake: they point at as many players as the Demon they believe
// they are would, and a tap past that swaps the oldest pick out — a
// "Shabaloth" who could pick three was the 2026-09 playtest's finding.

import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  beginNight,
  createGame,
  dawn,
  endDay,
  moveNightCursor,
  nightQueue,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import type { GameSetup } from "@boardgames/core/games/blood-on-the-clocktower/setup";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PrivacyProvider } from "../privacy";
import NightPanel from "./NightPanel";

const NAMES = ["Alice", "Bob", "Cara", "Dan", "Eve", "Finn", "Gwen", "Hana"];
const LUNATIC = 6;

/** Night 2 after a deathless day, cursor on the Lunatic's wake. */
function atLunaticWake(believed: CharacterId): CompanionState {
  const chars: CharacterId[] = [
    "zombuul",
    "godfather",
    "sailor",
    "chambermaid",
    "innkeeper",
    "tea-lady",
    "lunatic",
    "gossip",
  ];
  const setup: GameSetup = {
    edition: "bad-moon-rising",
    seats: chars.map((character, seat) => ({
      seat,
      name: NAMES[seat],
      character,
      ...(character === "lunatic" ? { believedCharacter: believed } : {}),
    })),
    distribution: { townsfolk: 5, outsiders: 1, minions: 1, demons: 1 },
    demonBluffs: ["minstrel", "pacifist", "tinker"],
  };
  const s = endDay(dawn(beginNight(createGame(setup))));
  const at = nightQueue(s).findIndex((x) => x.kind === "wake" && x.seat === LUNATIC);
  if (at < 0) throw new Error("the Lunatic does not wake");
  return moveNightCursor(s, at);
}

function Night({ initial, handOver = false }: { initial: CompanionState; handOver?: boolean }) {
  const [state, setState] = useState(initial);
  return (
    <PrivacyProvider initial={handOver}>
      <NightPanel state={state} update={(fn) => setState((x) => fn(x))} />
      <output data-testid="state">
        {JSON.stringify({ chose: state.lunaticChoices, charged: state.lunaticPoChargedNight })}
      </output>
    </PrivacyProvider>
  );
}

const seat = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const pressed = (name: string) => seat(name).getAttribute("aria-pressed") === "true";

describe("LunaticActStep", () => {
  it("as the Shabaloth takes two picks — a third replaces the oldest", () => {
    render(<Night initial={atLunaticWake("shabaloth")} />);
    expect(screen.getByText(/let them point at two players/)).toBeInTheDocument();
    const record = () => screen.getByRole("button", { name: /Record the Lunatic's picks/ });
    expect(record()).toBeDisabled();
    fireEvent.click(seat("Bob"));
    expect(record()).toHaveTextContent("(1/2)");
    expect(record()).toBeDisabled();
    fireEvent.click(seat("Cara"));
    fireEvent.click(seat("Dan"));
    expect([pressed("Bob"), pressed("Cara"), pressed("Dan")]).toEqual([false, true, true]);
    expect(record()).toHaveTextContent("(2/2)");
    fireEvent.click(record());
    expect(screen.getByTestId("state")).toHaveTextContent('{"chose":[2,3]}');
    expect(screen.getByText(/Recorded \(Cara, Dan\)/)).toBeInTheDocument();
  });

  it("as the Po may choose no one — charging three picks for the next wake", () => {
    render(<Night initial={atLunaticWake("po")} />);
    expect(screen.getByText(/let them point at one player/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "They choose NO ONE — charge up" }));
    expect(screen.getByTestId("state")).toHaveTextContent('{"chose":[],"charged":2}');
    expect(screen.getByText(/Recorded — they chose no one/)).toBeInTheDocument();
  });

  it("in hand-over mode the phone never says 'Lunatic'", () => {
    render(<Night initial={atLunaticWake("shabaloth")} handOver />);
    expect(screen.queryByText(/Lunatic/)).toBeNull();
    fireEvent.click(seat("Bob"));
    fireEvent.click(seat("Cara"));
    fireEvent.click(screen.getByRole("button", { name: "Record the picks (2/2)" }));
    expect(screen.getByTestId("state")).toHaveTextContent('{"chose":[1,2]}');
    expect(screen.queryByText(/Lunatic/)).toBeNull();
  });
});
