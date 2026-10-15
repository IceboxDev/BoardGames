import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { games } from "../../games/registry";
import { type ExtraMode, isPlayable, type PlayableGame, type SoloMode } from "../../games/types";
import ModeSelectRoute from "./ModeSelectRoute";

const useGameShellMock = vi.fn();
vi.mock("../../hooks/useGameShell", () => ({
  useGameShell: () => useGameShellMock(),
}));

// Every playable game's mode picker is the same screen; only these differ:
// the extra mode (first card), the solo group (one of four, identical within
// the group), whether online rooms exist yet, the rulebook and the tournament. Anything else per game is
// drift — this pins the whole registry to that contract.

/** The four solo groups, pinned. A new game defaults to `singleplayer`. */
const NON_SINGLEPLAYER_GROUPS: Readonly<Record<string, SoloMode>> = {
  set: "trainer",
  quiztopia: "trainer",
  "dungeons-and-dragons": "companion",
  "blood-on-the-clocktower": "companion",
  "the-resistance": "solver",
};

const CARD: Record<ExtraMode, string> = {
  singleplayer: "Singleplayer",
  trainer: "Trainer",
  companion: "Companion",
  solver: "Solver",
  coach: "Coach",
  "score-sheet": "Score Sheet",
  campaign: "Campaign",
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
    const mode = def.soloMode ?? "singleplayer";
    expect(mode).toBe(NON_SINGLEPLAYER_GROUPS[slug] ?? "singleplayer");

    // Three main cards, always: the other mode, Singleplayer, Multiplayer.
    expect(def.extraMode).not.toBe(mode);
    // Every game has a Singleplayer card: a game whose solo group is something
    // else shows Singleplayer as its extra mode.
    if (mode !== "singleplayer") expect(def.extraMode).toBe("singleplayer");
    const [first, middle] = mode === "singleplayer" ? [def.extraMode, mode] : [mode, def.extraMode];
    const main = screen
      .getAllByRole("button")
      .filter(
        (b) =>
          Object.values(CARD).some((label) => b.textContent?.startsWith(label)) ||
          b.textContent?.startsWith("Multiplayer"),
      );
    expect(main.map((b) => b.textContent)).toEqual([
      expect.stringMatching(new RegExp(`^${CARD[first]}`)),
      expect.stringMatching(new RegExp(`^${CARD[middle]}`)),
      expect.stringMatching(/^Multiplayer/),
    ]);

    // The extra mode opens where the game wired it, else it's disabled and badged.
    const [a, b, mp] = main as HTMLButtonElement[];
    const [extra, solo] = mode === "singleplayer" ? [a, b] : [b, a];
    const wired = def.extraModePath !== undefined;
    expect(extra.disabled).toBe(!wired);
    expect(within(extra.parentElement as HTMLElement).queryByText("Coming soon") !== null).toBe(
      !wired,
    );
    expect(solo.disabled).toBe(false);

    // The one Multiplayer card — same copy everywhere, disabled + badged when
    // the game has no rooms yet.
    expect(within(mp).getByText("Create a room and play online with friends")).toBeTruthy();
    expect(mp.disabled).toBe(def.multiplayerComingSoon === true);
    expect(screen.queryAllByText("Coming soon")).toHaveLength(
      (def.multiplayerComingSoon ? 1 : 0) + (wired ? 0 : 1),
    );

    expect(screen.getByRole("button", { name: /^Match History/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^AI Tournament/ }) !== null).toBe(
      def.tournamentResults !== undefined,
    );
    expect(screen.queryByRole("button", { name: /How to Play/ }) !== null).toBe(
      def.rulesUrl !== undefined,
    );
  });

  // Games Board Game Arena hosts (its game list, 2026-10-14), chess aside:
  // their extra card is the Companion that analyses a BGA game alongside it.
  const ON_BGA = [
    "7-wonders",
    "connect-4",
    "decrypto",
    "durak",
    "exploding-kittens",
    "go",
    "lost-cities",
    "pandemic",
    "parks",
    "sky-team",
    "sushi-go",
  ];

  it("every game on BGA except chess offers the Companion", () => {
    expect(playable.filter((def) => ON_BGA.includes(def.slug)).map((def) => def.extraMode)).toEqual(
      ON_BGA.map(() => "companion"),
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

  // Placeholder bots that play by the rules, not to win — nothing to rank
  // until a real AI replaces them.
  const STAND_IN_BOTS_ONLY = ["blood-on-the-clocktower"];

  it("every game with AI strategies has a tournament", () => {
    const missing = playable
      .filter((def) => (def.manifest?.strategies.length ?? 0) > 0 && !def.tournamentResults)
      .filter((def) => !STAND_IN_BOTS_ONLY.includes(def.slug))
      .map((def) => def.slug);
    expect(missing).toEqual(TOURNAMENT_PENDING);
  });
});
