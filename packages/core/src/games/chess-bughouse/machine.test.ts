import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AnyActorRef, createActor } from "xstate";
import type { StartSeat } from "../../machines/seats";
import { parseFen } from "../chess/engine/fen";
import { createBughouse, playBughouseMove, seatMoves } from "./game";
import { bughouseSpec } from "./machine";
import { BughouseConfigSchema } from "./manifest";
import { type BughouseAction, BughousePlayerViewSchema, BughouseReplayLogSchema } from "./schemas";

const PEOPLE: StartSeat[] = [
  { kind: "human" },
  { kind: "human" },
  { kind: "human" },
  { kind: "human" },
];

function start(seats: StartSeat[] = PEOPLE, config: unknown = { timeControl: null }): AnyActorRef {
  const actor = createActor(bughouseSpec.machine);
  actor.start();
  actor.send(
    bughouseSpec.buildStart({ seats, config: BughouseConfigSchema.parse(config), seed: 5 }),
  );
  return actor;
}

function act(actor: AnyActorRef, seat: number, action: BughouseAction): void {
  const v = bughouseSpec.validateAction(actor.getSnapshot(), seat, {
    type: "PLAYER_ACTION",
    action,
  });
  if (!v.ok) throw new Error(`${JSON.stringify(action)} by ${seat} rejected: ${v.reason}`);
  actor.send(v.event);
}
const move = (a: AnyActorRef, seat: number, uci: string) => act(a, seat, { kind: "move", uci });
const view = (a: AnyActorRef, seat: number) =>
  BughousePlayerViewSchema.parse(bughouseSpec.getPlayerView(a.getSnapshot(), seat));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("bughouse rules", () => {
  it("passes a capture to the partner's pocket, in the captured piece's colour", () => {
    let g = createBughouse(null, 0);
    g = playBughouseMove(g, 0, "e2e4", 1);
    g = playBughouseMove(g, 1, "d7d5", 2);
    g = playBughouseMove(g, 0, "e4d5", 3); // White on A takes a black pawn…
    // …which goes to White's partner — Black on board B (seat 3).
    expect(g.boards[1].position.pockets?.b.p).toBe(1);
    expect(g.boards[0].position.pockets?.w.p).toBe(0);
    g = playBughouseMove(g, 2, "e2e4", 4);
    expect(seatMoves(g, 3)).toContain("P@e5");
  });

  it("returns a captured promoted piece as a pawn", () => {
    const board = parseFen("4k3/8/8/8/8/8/8/3q~K3[] w - - 0 1", { bughouse: true });
    let g = createBughouse(null, 0);
    g = { ...g, boards: [{ ...g.boards[0], position: board }, g.boards[1]] };
    g = playBughouseMove(g, 0, "e1d1", 1);
    expect(g.boards[1].position.pockets?.b).toMatchObject({ p: 1, q: 0 });
  });
});

describe("bughouse machine", () => {
  it("lets both boards move at once and ends the match on either board's mate", () => {
    const a = start();
    expect(bughouseSpec.getActivePlayer(a.getSnapshot())).toBe(-1);
    // Fool's mate on board B while board A plays along.
    move(a, 2, "f2f3");
    move(a, 0, "e2e4");
    move(a, 3, "e7e5");
    move(a, 2, "g2g4");
    move(a, 3, "d8h4");
    expect(bughouseSpec.isGameOver(a.getSnapshot())).toBe(true);
    expect(bughouseSpec.getResult(a.getSnapshot())).toMatchObject({
      winningTeam: 0,
      board: 1,
      loserSeat: 2,
      termination: "checkmate",
    });
    expect(bughouseSpec.getOutcome(a.getSnapshot())).toEqual({
      kind: "teams",
      teamOf: [0, 1, 1, 0],
      winningTeam: 0,
    });
    const log = BughouseReplayLogSchema.parse(bughouseSpec.getReplayLog(a.getSnapshot()));
    expect(log.moves.map((m) => `${m.board}:${m.san}`)).toEqual([
      "1:f3",
      "0:e4",
      "1:e5",
      "1:g4",
      "1:Qh4#",
    ]);
  });

  it("shows signals to the sender's team only", () => {
    const a = start();
    act(a, 0, { kind: "signal", code: "need-n" });
    expect(view(a, 3).signals.map((s) => s.code)).toEqual(["need-n"]);
    expect(view(a, 1).signals).toEqual([]);
  });

  it("flags a board and hands the match to the other team", async () => {
    const a = start(PEOPLE, { timeControl: { initialMs: 30_000, incrementMs: 0 } });
    move(a, 0, "e2e4");
    move(a, 2, "d2d4");
    move(a, 3, "d7d5");
    await vi.advanceTimersByTimeAsync(30_100);
    // Black on A never moved; White on B is to move too — A's Black flags first.
    expect(bughouseSpec.getResult(a.getSnapshot())).toMatchObject({ termination: "timeout" });
  });

  it("runs both boards' bots at the same time", async () => {
    const seats: StartSeat[] = [
      { kind: "human" },
      { kind: "ai", strategy: "random" },
      { kind: "ai", strategy: "random" },
      { kind: "ai", strategy: "random" },
    ];
    const a = start(seats);
    // Board B is all bots: it plays while seat 0 thinks.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(view(a, 0).boards[1].history.length).toBeGreaterThan(2);
    expect(view(a, 0).boards[0].history).toHaveLength(0);
    move(a, 0, "e2e4");
    await vi.advanceTimersByTimeAsync(400);
    expect(view(a, 0).boards[0].history).toHaveLength(2);
  });

  it("refuses a move on someone else's board", () => {
    const a = start();
    const v = bughouseSpec.validateAction(a.getSnapshot(), 1, {
      type: "PLAYER_ACTION",
      action: { kind: "move", uci: "e2e4" },
    });
    expect(v.ok).toBe(false);
  });
});
