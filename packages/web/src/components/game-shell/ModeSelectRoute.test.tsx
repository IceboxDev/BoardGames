import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { games } from "../../games/registry";
import { isPlayable, type PlayableGame, type SoloMode } from "../../games/types";
import ModeSelectRoute from "./ModeSelectRoute";

const useGameShellMock = vi.fn();
vi.mock("../../hooks/useGameShell", () => ({
  useGameShell: () => useGameShellMock(),
}));

// Every playable game's mode picker is the same screen; only these differ:
// the solo group (one of four, identical within the group), whether online
// rooms exist yet, the rulebook and the tournament. Anything else per game is
// drift — this pins the whole registry to that contract.

/** The four solo groups, pinned. A new game defaults to `ai`. */
const NON_AI_GROUPS: Readonly<Record<string, SoloMode>> = {
  set: "trainer",
  quiztopia: "trainer",
  "dungeons-and-dragons": "companion",
  "blood-on-the-clocktower": "companion",
  "the-resistance": "solver",
};

const SOLO_CARD: Record<SoloMode, string> = {
  ai: "Play vs AI",
  trainer: "Trainer",
  companion: "Companion",
  solver: "Solver",
};

const playable = games.filter(isPlayable);

function renderMenu(def: PlayableGame) {
  useGameShellMock.mockReturnValue({ def });
  const router = createMemoryRouter([{ path: "/play/:slug", element: <ModeSelectRoute /> }], {
    initialEntries: [`/play/${def.slug}`],
  });
  return render(<RouterProvider router={router} />);
}

afterEach(() => useGameShellMock.mockReset());

describe("mode picker — one contract for every game", () => {
  it("covers every playable game", () => {
    expect(playable.length).toBeGreaterThanOrEqual(22);
  });

  it.each(playable.map((def) => [def.slug, def] as const))("%s", (slug, def) => {
    renderMenu(def);
    const mode = def.soloMode ?? "ai";
    expect(mode).toBe(NON_AI_GROUPS[slug] ?? "ai");

    // The group's card, and none of the other groups' cards.
    for (const [group, label] of Object.entries(SOLO_CARD)) {
      const card = screen.queryByRole("button", { name: new RegExp(`^${label}`) });
      if (group === mode) expect(card).not.toBeNull();
      else expect(card).toBeNull();
    }

    // The one Multiplayer card — same copy everywhere, disabled + badged when
    // the game has no rooms yet.
    const mp = screen.getByRole("button", { name: /^Multiplayer/ });
    expect(within(mp).getByText("Create a room and play online with friends")).toBeTruthy();
    expect((mp as HTMLButtonElement).disabled).toBe(def.multiplayerComingSoon === true);
    expect(screen.queryByText("Coming soon") !== null).toBe(def.multiplayerComingSoon === true);

    expect(screen.getByRole("button", { name: /^Match History/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^AI Tournament/ }) !== null).toBe(
      def.tournamentResults !== undefined,
    );
    expect(screen.queryByRole("button", { name: /How to Play/ }) !== null).toBe(
      def.rulesUrl !== undefined,
    );
  });

  it("every game has a rulebook", () => {
    expect(playable.filter((def) => !def.rulesUrl).map((def) => def.slug)).toEqual([]);
  });

  // Simulators exist for these, but no results file yet: the LLM games bill
  // for every clue (run with TOURNAMENT_LLM=1 and a key), and 7 Wonders' C++
  // search must be rebuilt for the machine that runs it. Wire each one as its
  // file lands — then this list shrinks; it must never grow.
  const TOURNAMENT_PENDING = ["7-wonders", "codenames", "codenames-duet", "decrypto"];

  it("every game with AI strategies has a tournament", () => {
    const missing = playable
      .filter((def) => (def.manifest?.strategies.length ?? 0) > 0 && !def.tournamentResults)
      .map((def) => def.slug);
    expect(missing).toEqual(TOURNAMENT_PENDING);
  });
});
