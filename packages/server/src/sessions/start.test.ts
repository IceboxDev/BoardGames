import { describe, expect, it } from "vitest";
import { getServerGame } from "../games/registry.ts";
import { prepareStart } from "./start.ts";

function spec(slug: string) {
  const game = getServerGame(slug);
  if (!game) throw new Error(`no game ${slug}`);
  return game.spec;
}

describe("prepareStart", () => {
  it("builds the game's own START from seats, parsed options and the seed", () => {
    const started = prepareStart(
      spec("the-hunger"),
      [{ kind: "human" }, { kind: "ai", strategy: "heuristic-v1" }],
      { mode: "rookie" },
      42,
    );
    expect(started).toMatchObject({
      ok: true,
      seed: 42,
      event: {
        type: "START",
        playerCount: 2,
        strategies: [null, "heuristic-v1"],
        options: { mode: "rookie", beginnerSafeMountains: false },
        seed: 42,
      },
    });
  });

  it("fills omitted options with the manifest's defaults", () => {
    const started = prepareStart(
      spec("sky-team"),
      [{ kind: "human" }, { kind: "human" }],
      undefined,
    );
    expect(started.ok && started.event).toMatchObject({ scenarioId: "yul-montreal" });
  });

  it("rejects a table outside the manifest's seat range", () => {
    const started = prepareStart(spec("lost-cities"), [{ kind: "human" }], {});
    expect(started).toEqual({ ok: false, reason: "Needs at least 2 players" });
  });

  it("rejects an AI the game does not offer, including one offered only at other sizes", () => {
    expect(
      prepareStart(spec("durak"), [{ kind: "human" }, { kind: "ai", strategy: "nope" }], {}).ok,
    ).toBe(false);
    // Nash only solves two-player Sushi Go.
    expect(
      prepareStart(
        spec("sushi-go"),
        [{ kind: "human" }, { kind: "ai", strategy: "nash" }, { kind: "ai", strategy: "nash" }],
        {},
      ).ok,
    ).toBe(false);
  });

  it("rejects AI seats in a game without AI, and a table with no person", () => {
    expect(
      prepareStart(spec("pandemic"), [{ kind: "human" }, { kind: "ai", strategy: "x" }], {}).ok,
    ).toBe(false);
    expect(
      prepareStart(
        spec("durak"),
        [
          { kind: "ai", strategy: "random" },
          { kind: "ai", strategy: "random" },
        ],
        {},
      ).ok,
    ).toBe(false);
  });

  it("rejects options that fail the game's schema, naming the field", () => {
    const started = prepareStart(spec("sky-team"), [{ kind: "human" }, { kind: "human" }], {
      scenarioId: "atlantis",
    });
    expect(started.ok).toBe(false);
    expect(!started.ok && started.reason).toContain("scenarioId");
  });

  it("never lets client options override the seating", () => {
    const started = prepareStart(
      spec("durak"),
      [{ kind: "human" }, { kind: "ai", strategy: "random" }],
      { playerCount: 5, strategies: [null, null, null, null, null], type: "RESET" },
    );
    expect(started.ok && started.event).toMatchObject({
      type: "START",
      playerCount: 2,
      strategies: [null, "random"],
    });
  });
});
