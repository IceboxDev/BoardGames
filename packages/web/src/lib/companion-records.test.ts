import { type CompanionRecord, CompanionRecordSchema } from "@boardgames/core/protocol";
import { describe, expect, it, vi } from "vitest";
import { recordCompanionGame, recordFingerprint } from "./companion-records";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const record: CompanionRecord = CompanionRecordSchema.parse({
  game: "blood-on-the-clocktower",
  edition: "trouble-brewing",
  storyteller: null,
  players: ["Ana", "Ben", "Cleo", "Dan", "Eve"].map((name, seat) => ({
    seat,
    name,
    character: seat === 0 ? "imp" : "empath",
    alignment: seat === 0 ? "evil" : "good",
    alive: true,
  })),
  winner: "good",
  reason: "the Demon is dead",
  days: 2,
  startedAt: "2026-10-10T19:00:00.000Z",
  endedAt: "2026-10-10T20:00:00.000Z",
});

describe("recordFingerprint", () => {
  it("ignores when the end was noticed, not what the record says", () => {
    const later = { ...record, endedAt: "2026-10-10T21:00:00.000Z" } as CompanionRecord;
    expect(recordFingerprint(later)).toBe(recordFingerprint(record));
    const flipped = { ...record, winner: "evil" } as CompanionRecord;
    expect(recordFingerprint(flipped)).not.toBe(recordFingerprint(record));
  });
});

describe("recordCompanionGame", () => {
  it("queues a record once, and again only when it changes", async () => {
    const enqueue = vi.fn(async () => {});
    const opts = { outbox: { enqueue }, store: memoryStore() };

    expect(await recordCompanionGame("game-0001", record, opts)).toBe(true);
    // The ended screen shown again after a refresh: nothing new to send.
    const seenAgain = { ...record, endedAt: "2026-10-10T20:05:00.000Z" } as CompanionRecord;
    expect(await recordCompanionGame("game-0001", seenAgain, opts)).toBe(false);
    // The winner corrected after an Undo: a new version, same record id.
    const corrected = { ...record, winner: "evil" } as CompanionRecord;
    expect(await recordCompanionGame("game-0001", corrected, opts)).toBe(true);

    expect(enqueue).toHaveBeenCalledTimes(2);
    const [first, second] = enqueue.mock.calls.map((c) => (c as unknown[])[0]);
    expect(first).toMatchObject({ body: { clientId: "game-0001", record: { winner: "good" } } });
    expect(second).toMatchObject({ body: { clientId: "game-0001", record: { winner: "evil" } } });
    expect((first as { key: string }).key).not.toBe((second as { key: string }).key);
  });

  it("still queues when storage is unavailable", async () => {
    const enqueue = vi.fn(async () => {});
    expect(
      await recordCompanionGame("game-0002", record, { outbox: { enqueue }, store: null }),
    ).toBe(true);
    expect(enqueue).toHaveBeenCalledOnce();
  });
});
