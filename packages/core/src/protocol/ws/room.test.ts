import { describe, expect, it } from "vitest";
import { type RoomSlot, roomSeating } from "./room.ts";

const human: RoomSlot = { kind: "human", ready: true, connected: true };
const ai: RoomSlot = { kind: "ai", aiStrategy: "x", ready: true, connected: false };
const open: RoomSlot = { kind: "open", ready: false, connected: false };

describe("roomSeating", () => {
  it("seats filled slots in slot order by default", () => {
    expect(roomSeating([human, ai, human])).toEqual([0, 1, 2]);
  });

  it("closes the gap an open slot leaves", () => {
    expect(roomSeating([human, open, human, ai])).toEqual([0, 2, 3]);
  });

  it("follows the host's seat swaps", () => {
    expect(roomSeating([human, human], [1, 0])).toEqual([1, 0]);
    expect(roomSeating([human, open, ai], [2, 1, 0])).toEqual([2, 0]);
  });
});
