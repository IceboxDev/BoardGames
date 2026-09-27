/**
 * `seatRoom` is the seam between a room's slots and a game's seats: open slots
 * leave no gap, the host's swaps decide the order, and every AI seat carries a
 * strategy the game offers.
 */

import { getManifest } from "@boardgames/core/games/manifests";
import type { RoomSlot } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { seatRoom } from "./room-manager.ts";

const human = (name: string): RoomSlot => ({
  kind: "human",
  playerName: name,
  ready: true,
  connected: true,
});
const ai = (aiStrategy?: string): RoomSlot => ({
  kind: "ai",
  ...(aiStrategy ? { aiStrategy } : {}),
  ready: true,
  connected: false,
});
const open: RoomSlot = { kind: "open", ready: false, connected: false };

function manifest(slug: string) {
  const m = getManifest(slug);
  if (!m) throw new Error(`no manifest for ${slug}`);
  return m;
}

function seat(slots: RoomSlot[], slug: string, seatOrder?: number[]) {
  return seatRoom(
    {
      slots,
      seatOrder: seatOrder ?? slots.map((_, i) => i),
      slotUserIds: slots.map((s, i) => (s.kind === "human" ? `user-${i}` : undefined)),
    },
    manifest(slug),
  );
}

describe("seatRoom", () => {
  it("seats filled slots in order and records who holds each human seat", () => {
    const { seats, slotOfSeat } = seat([human("Ana"), ai("random"), human("Bo")], "durak");
    expect(slotOfSeat).toEqual([0, 1, 2]);
    expect(seats).toEqual([
      { kind: "human", userId: "user-0", name: "Ana" },
      { kind: "ai", strategy: "random", userId: null, name: null },
      { kind: "human", userId: "user-2", name: "Bo" },
    ]);
  });

  it("closes the gap an open slot leaves", () => {
    const { seats, slotOfSeat } = seat([human("Ana"), open, human("Bo"), open], "quiztopia");
    expect(slotOfSeat).toEqual([0, 2]);
    expect(seats.map((s) => s.kind)).toEqual(["human", "human"]);
  });

  it("follows the host's seat swap (Sky Team: who flies as Pilot)", () => {
    const { seats } = seat([human("Host"), human("Guest")], "sky-team", [1, 0]);
    expect(seats.map((s) => s.kind === "human" && s.name)).toEqual(["Guest", "Host"]);
  });

  it("gives an AI slot without a strategy, or with an unknown one, the default", () => {
    const { seats } = seat([human("Ana"), ai(), ai("made-up")], "senso-battle-for-japan");
    expect(seats.slice(1)).toEqual([
      { kind: "ai", strategy: "kami", userId: null, name: null },
      { kind: "ai", strategy: "kami", userId: null, name: null },
    ]);
  });

  it("uses the table-size default where strategies depend on it (Sushi Go at 3)", () => {
    const { seats } = seat([human("Ana"), ai(), ai("nash")], "sushi-go");
    // Nash only solves two seats, so at three both AI seats play Random.
    expect(seats.slice(1).map((s) => s.kind === "ai" && s.strategy)).toEqual(["random", "random"]);
  });
});
