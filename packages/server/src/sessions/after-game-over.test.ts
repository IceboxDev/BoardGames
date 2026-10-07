/**
 * `ServerGame.afterGameOver` — a game's follow-up writes once a session ends
 * (Quiztopia records the table's answers as trainer reviews). Driven through
 * the real session manager with a Durak table (one autoplaying member, one
 * AI) played to the end:
 * the hook gets the session's identity, seats and replay log, runs after the
 * players' game-over frame, and a throw in it is contained.
 */

import type { WSContext } from "hono/ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EndedGame, ServerGame } from "../games/registry.ts";

const hook = vi.hoisted(() => ({ impl: null as null | ((ended: EndedGame) => Promise<void>) }));

vi.mock("../matches/store.ts", () => ({ saveMatch: async () => 1 }));
vi.mock("../games/registry.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../games/registry.ts")>();
  const { durakMachine } = await import("@boardgames/core/games/durak/machine");
  return {
    ...real,
    getServerGame: (slug: string): ServerGame | undefined => {
      const game = real.getServerGame(slug);
      if (!game || slug !== "durak") return game;
      return {
        ...game,
        // No pause after the AI's move: the table plays out in milliseconds.
        createMachine: () => durakMachine.provide({ delays: { aiDelay: 0 } }),
        afterGameOver: (ended) => hook.impl?.(ended) ?? Promise.resolve(),
      };
    },
  };
});

const { startRoomSession, endSession, handleWsMessage } = await import("./manager.ts");

const MAX_MOVES = 5_000;

/**
 * The human seat's socket. It plays by itself: on every frame that offers it
 * moves, it answers with one picked by a seeded random walk (random play
 * always finishes a Durak game), the way a client sends a `PLAYER_ACTION`.
 * Only frame types are kept, and a move cap turns a runaway into a failure.
 */
function autoplayer() {
  const sent: { type: string }[] = [];
  let moves = 0;
  let rng = 12345;
  const pick = (n: number) => {
    rng = (rng * 1_103_515_245 + 12_345) % 2_147_483_648;
    return rng % n;
  };
  // Act on the LATEST frame only, once the burst of frames has settled, and
  // only on our own turn — like a person looking at the current screen. A
  // move refused mid-beat is simply tried again.
  let latest: { sessionId: string; legal: unknown[] } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer === null && latest) timer = setTimeout(act, 0);
  };
  const act = () => {
    timer = null;
    const frame = latest;
    if (!frame) return;
    if (++moves > MAX_MOVES) throw new Error("the table never finished");
    handleWsMessage(ws, {
      type: "action",
      sessionId: frame.sessionId,
      action: { type: "PLAYER_ACTION", action: frame.legal[pick(frame.legal.length)] },
    });
  };
  const ws = {
    readyState: 1,
    send: (data: string) => {
      const msg = JSON.parse(data) as {
        type: string;
        sessionId?: string;
        activePlayer?: number;
        legalActions?: unknown[];
      };
      sent.push({ type: msg.type });
      if (msg.type === "game-over") latest = null;
      if (msg.type === "error") schedule();
      if (msg.type !== "state-update" && msg.type !== "game-started") return;
      const legal = msg.legalActions ?? [];
      const mine = msg.activePlayer === 0 || msg.activePlayer === -1;
      latest =
        msg.sessionId && mine && legal.length > 0 ? { sessionId: msg.sessionId, legal } : null;
      schedule();
    },
  } as unknown as WSContext;
  return { ws, sent };
}

function startTable(human: ReturnType<typeof autoplayer>) {
  const started = startRoomSession({
    gameSlug: "durak",
    seats: [
      { kind: "human", userId: "member-1", name: "Member" },
      { kind: "ai", strategy: "random", userId: null, name: null },
    ],
    players: [{ ws: human.ws, playerIndex: 0, connected: true }],
    rawConfig: {},
    roomCode: "TESTRM",
  });
  if (!started.ok) throw new Error(started.reason);
  return started.sessionId;
}

let sessionId: string | null = null;

afterEach(() => {
  hook.impl = null;
  if (sessionId) endSession(sessionId);
  sessionId = null;
  vi.restoreAllMocks();
});

describe("afterGameOver", () => {
  it("runs once the players have their game-over frame, with the session's facts", async () => {
    const human = autoplayer();
    const calls: { ended: EndedGame; frameSent: boolean }[] = [];
    hook.impl = async (ended) => {
      calls.push({ ended, frameSent: human.sent.some((m) => m.type === "game-over") });
    };
    sessionId = startTable(human);

    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0), { timeout: 20_000 });
    const [{ ended, frameSent }] = calls;
    expect(frameSent).toBe(true);
    expect(ended.sessionId).toBe(sessionId);
    expect(ended.roomCode).toBe("TESTRM");
    expect(ended.seatUserIds).toEqual(["member-1", null]);
    expect(ended.replayLog).not.toBeNull();
    expect(ended.endedAt).toBeInstanceOf(Date);
  }, 20_000);

  it("contains a throwing hook: it is logged and nothing else breaks", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let ran = false;
    hook.impl = async () => {
      ran = true;
      throw new Error("follow-up write failed");
    };
    const human = autoplayer();
    sessionId = startTable(human);

    await vi.waitFor(() => expect(ran).toBe(true), { timeout: 20_000 });
    await vi.waitFor(() =>
      expect(errors).toHaveBeenCalledWith(
        expect.stringContaining("[afterGameOver] durak"),
        expect.any(Error),
      ),
    );
    expect(human.sent.some((m) => m.type === "game-over")).toBe(true);
  }, 20_000);
});
