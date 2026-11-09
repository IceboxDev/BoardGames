import { duetSpec } from "@boardgames/core/games/codenames-duet/machine";
import { duetManifest } from "@boardgames/core/games/codenames-duet/manifest";
import { createDuet } from "@boardgames/core/games/codenames-duet/rules";
import type { WSContext } from "hono/ws";
import { afterEach, describe, expect, it } from "vitest";
import { getServerGame } from "../games/registry.ts";
import { sessionChainsForTests as chains, forgetRoomChain } from "./manager.ts";
import { prepareStart } from "./start.ts";

const ws = {} as WSContext;
const human = (userId: string | null) => ({ kind: "human" as const, userId, name: null });
const ai = { kind: "ai" as const, strategy: "codenames-medium", userId: null, name: null };

afterEach(() => chains.reset());

describe("session chains", () => {
  it("chains a room's games, and a player's solo games per slug", () => {
    const players = [{ ws, playerIndex: 0, connected: true }];
    expect(
      chains.chainKeyFor({ gameSlug: "codenames-duet", roomCode: "ABCDEF", seats: [], players }),
    ).toBe("room:ABCDEF");
    expect(
      chains.chainKeyFor({ gameSlug: "codenames-duet", seats: [human("u1"), ai], players }),
    ).toBe("user:u1:codenames-duet");
    const guest = chains.chainKeyFor({ gameSlug: "codenames", seats: [human(null)], players });
    expect(guest).toMatch(/^guest:/);
    expect(chains.chainKeyFor({ gameSlug: "codenames", seats: [human(null)], players })).toBe(
      guest,
    );
  });

  it("remembers the newest logs first, a bounded number, and forgets a closed room", () => {
    for (let i = 0; i < 20; i++) chains.rememberLog("room:ROOMAA", { n: i });
    const logs = chains.recentLogsFor("room:ROOMAA") as { n: number }[];
    expect(logs[0]?.n).toBe(19);
    expect(logs.length).toBeLessThan(20);
    forgetRoomChain("ROOMAA");
    expect(chains.recentLogsFor("room:ROOMAA")).toEqual([]);
  });

  it("a Duet started after another deals none of its words", () => {
    const seats = [
      { kind: "human" as const },
      { kind: "ai" as const, strategy: "codenames-medium" },
    ];
    const config = duetManifest.config.parse({});
    const start = (seed: number, recentLogs: unknown[]) => {
      const event = duetSpec.buildStart({ seats, config, seed, recentLogs });
      if (event.type !== "START") throw new Error("not a start");
      return createDuet(event).words;
    };
    const first = start(1, []);
    const second = start(2, [{ words: first }]);
    expect(second.filter((w) => first.includes(w))).toEqual([]);

    // The session path hands the chain's logs to the game.
    const spec = getServerGame("codenames-duet")?.spec;
    if (!spec) throw new Error("no duet");
    const prepared = prepareStart(spec, seats, {}, 2, [{ words: first }]);
    expect(prepared.ok && prepared.event).toMatchObject({ recentBoards: [first] });
  });
});
