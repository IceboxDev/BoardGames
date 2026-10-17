import { describe, expect, it } from "vitest";
import { type RoomSlot, RoomSlotSchema, roomSeating } from "./room.ts";

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

describe("RoomSlotSchema", () => {
  it("carries a person's picture only as the server's versioned avatar URL", () => {
    const slot = { ...human, avatarUrl: "/api/avatars/user-1?v=abcDEF012_-9" };
    expect(RoomSlotSchema.parse(slot)).toEqual(slot);
    for (const avatarUrl of [
      "https://evil.example/x.png",
      "/api/avatars/user-1",
      "/api/avatars/a/b?v=1",
      "javascript:alert(1)",
    ]) {
      const result = RoomSlotSchema.safeParse({ ...human, avatarUrl });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["avatarUrl"]);
    }
  });
});
