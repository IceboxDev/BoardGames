import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AnyActorRef, createActor } from "xstate";
import type { StartSeat } from "../../machines/seats";
import type { ChessAgent } from "./agent";
import { ABANDON_MS, chessSpec, withChessAgent } from "./machine";
import { ChessConfigSchema } from "./manifest";
import { type ChessAction, ChessPlayerViewSchema, ChessReplayLogSchema } from "./schemas";

const HUMANS: StartSeat[] = [{ kind: "human" }, { kind: "human" }];
const VS_AI: StartSeat[] = [{ kind: "human" }, { kind: "ai", strategy: "random" }];

function start(seats: StartSeat[], config: unknown = {}, machine = chessSpec.machine): AnyActorRef {
  const actor = createActor(machine);
  actor.start();
  actor.send(chessSpec.buildStart({ seats, config: ChessConfigSchema.parse(config), seed: 7 }));
  return actor;
}

function act(actor: AnyActorRef, seat: number, action: ChessAction): void {
  const v = chessSpec.validateAction(actor.getSnapshot(), seat, { type: "PLAYER_ACTION", action });
  if (!v.ok) throw new Error(`${JSON.stringify(action)} rejected: ${v.reason}`);
  actor.send(v.event);
}

const move = (actor: AnyActorRef, seat: number, uci: string) =>
  act(actor, seat, { kind: "move", uci });
const view = (actor: AnyActorRef, seat = 0) =>
  ChessPlayerViewSchema.parse(chessSpec.getPlayerView(actor.getSnapshot(), seat));
const kinds = (actor: AnyActorRef, seat: number) =>
  chessSpec.getLegalActions(actor.getSnapshot(), seat).map((a) => a.kind);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("chess machine", () => {
  it("plays fool's mate to a checkmate win for Black", () => {
    const a = start(HUMANS);
    move(a, 0, "f2f3");
    move(a, 1, "e7e5");
    move(a, 0, "g2g4");
    move(a, 1, "d8h4");
    expect(chessSpec.isGameOver(a.getSnapshot())).toBe(true);
    expect(chessSpec.getResult(a.getSnapshot())).toEqual({ winner: "b", termination: "checkmate" });
    expect(chessSpec.getOutcome(a.getSnapshot())).toEqual({ kind: "ranked", placements: [2, 1] });
    const log = ChessReplayLogSchema.parse(chessSpec.getReplayLog(a.getSnapshot()));
    expect(log.moves.map((m) => m.san)).toEqual(["f3", "e5", "g4", "Qh4#"]);
  });

  it("rejects a move out of turn but takes a resignation", () => {
    const a = start(HUMANS);
    const off = chessSpec.validateAction(a.getSnapshot(), 1, {
      type: "PLAYER_ACTION",
      action: { kind: "move", uci: "e7e5" },
    });
    expect(off.ok).toBe(false);
    expect(chessSpec.acceptsOffTurn?.(a.getSnapshot(), 1, { action: { kind: "resign" } })).toBe(
      true,
    );
    expect(chessSpec.acceptsOffTurn?.(a.getSnapshot(), 1, { action: { kind: "move" } })).toBe(
      false,
    );
    act(a, 1, { kind: "resign" });
    expect(chessSpec.getResult(a.getSnapshot())).toEqual({ winner: "w", termination: "resign" });
  });

  it("offers a draw once per move; the receiver's move declines it", () => {
    const a = start(HUMANS);
    move(a, 0, "e2e4");
    act(a, 0, { kind: "offer-draw" });
    expect(kinds(a, 0)).not.toContain("offer-draw");
    expect(kinds(a, 1)).toEqual(expect.arrayContaining(["accept-draw", "decline-draw"]));
    move(a, 1, "e7e5");
    expect(view(a).drawOffer).toBeNull();
    act(a, 1, { kind: "offer-draw" });
    act(a, 0, { kind: "accept-draw" });
    expect(chessSpec.getResult(a.getSnapshot())).toEqual({
      winner: null,
      termination: "agreement",
    });
    expect(chessSpec.getOutcome(a.getSnapshot())).toEqual({ kind: "ranked", placements: [1, 1] });
  });

  it("takes back by consent between people", () => {
    const a = start(HUMANS);
    move(a, 0, "e2e4");
    move(a, 1, "e7e5");
    act(a, 1, { kind: "request-takeback" });
    act(a, 0, { kind: "accept-takeback" });
    expect(view(a).history.map((h) => h.uci)).toEqual(["e2e4"]);
    expect(kinds(a, 1)).toContain("move");
  });

  it("flags the side whose time runs out", async () => {
    const a = start(HUMANS, { timeControl: { initialMs: 60_000, incrementMs: 0 } });
    move(a, 0, "e2e4");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(view(a).clock?.remainingMs.b).toBe(30_000);
    await vi.advanceTimersByTimeAsync(30_100);
    expect(chessSpec.getResult(a.getSnapshot())).toEqual({ winner: "w", termination: "timeout" });
  });

  it("adds the increment and keeps the timer armed across offers", async () => {
    const a = start(HUMANS, { timeControl: { initialMs: 20_000, incrementMs: 2_000 } });
    await vi.advanceTimersByTimeAsync(5_000);
    move(a, 0, "e2e4");
    expect(view(a).clock?.remainingMs.w).toBe(17_000);
    act(a, 0, { kind: "offer-draw" });
    await vi.advanceTimersByTimeAsync(20_100);
    expect(chessSpec.getResult(a.getSnapshot())).toEqual({ winner: "w", termination: "timeout" });
  });

  it("calls a flag against a lone king a draw", async () => {
    // Untimed games can't reach this; drive the rule through the game API.
    const { createGame, flagGame } = await import("./game");
    const g = createGame({
      timeControl: { initialMs: 60_000, incrementMs: 0 },
      now: Date.now(),
      startFen: "4k3/8/8/8/8/8/8/R3K3 w - - 0 1",
    });
    expect(
      flagGame({ ...g, clock: g.clock && { ...g.clock, running: "w" } }, Date.now()).result,
    ).toEqual({ winner: null, termination: "timeout-vs-insufficient" });
  });

  it("lets the human take back against the AI, cancelling its search", async () => {
    let release: (uci: string) => void = () => {};
    const slow: ChessAgent = {
      bestMove: () => new Promise<string>((resolve) => (release = resolve)),
    };
    const seats: StartSeat[] = [{ kind: "human" }, { kind: "ai", strategy: "sf-1400" }];
    const a = start(seats, {}, withChessAgent(slow));
    move(a, 0, "e2e4");
    await vi.advanceTimersByTimeAsync(10);
    expect(view(a).aiThinking).toBe(true);
    act(a, 0, { kind: "takeback" });
    expect(view(a).history).toHaveLength(0);
    release("e7e5"); // the stale answer must be ignored
    await vi.advanceTimersByTimeAsync(10);
    expect(view(a).history).toHaveLength(0);
    expect(kinds(a, 0)).toContain("move");
  });

  it("plays the built-in move when the engine answers nonsense", async () => {
    const liar: ChessAgent = { bestMove: async () => "a1a8" };
    const seats: StartSeat[] = [{ kind: "human" }, { kind: "ai", strategy: "sf-1800" }];
    const a = start(seats, {}, withChessAgent(liar));
    move(a, 0, "e2e4");
    await vi.advanceTimersByTimeAsync(50);
    const history = view(a).history;
    expect(history).toHaveLength(2);
    expect(history[1]?.by).toBe("b");
  });

  it("the random AI replies, and a draw offer to it is declined in an even game", async () => {
    const a = start(VS_AI);
    move(a, 0, "e2e4");
    await vi.advanceTimersByTimeAsync(10);
    expect(view(a).history).toHaveLength(2);
    act(a, 0, { kind: "offer-draw" });
    expect(chessSpec.getResult(a.getSnapshot())).toBeNull();
    expect(view(a).drawOffer).toBeNull();
  });

  it("lets a player claim the game once the opponent has been gone a minute", async () => {
    const a = start(HUMANS);
    move(a, 0, "e2e4");
    a.send({ type: "SEAT_CONNECTION", seat: 1, connected: false });
    await vi.advanceTimersByTimeAsync(ABANDON_MS - 1_000);
    expect(kinds(a, 0)).not.toContain("claim-win");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(view(a).abandoned).toEqual([1]);
    expect(kinds(a, 0)).toContain("claim-win");
    act(a, 0, { kind: "claim-win" });
    expect(chessSpec.getResult(a.getSnapshot())).toEqual({ winner: "w", termination: "abandon" });
  });

  it("forgets the absence when the player comes back in time", async () => {
    const a = start(HUMANS);
    a.send({ type: "SEAT_CONNECTION", seat: 1, connected: false });
    await vi.advanceTimersByTimeAsync(30_000);
    a.send({ type: "SEAT_CONNECTION", seat: 1, connected: true });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(view(a).abandoned).toEqual([]);
    expect(view(a).disconnected).toEqual([]);
  });

  it("gives nothing to an idle snapshot", () => {
    const idle = createActor(chessSpec.machine);
    idle.start();
    expect(chessSpec.getLegalActions(idle.getSnapshot(), 0)).toEqual([]);
    expect(chessSpec.getActivePlayer(idle.getSnapshot())).toBe(-1);
  });
});
