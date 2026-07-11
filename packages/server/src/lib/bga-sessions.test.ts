import type { BgaEvent } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import {
  createOrReuseBgaSession,
  getActiveBgaSession,
  getBgaSessionByCode,
  getBgaSessionLastSeq,
  ingestBgaEvents,
  subscribeToBgaSession,
} from "./bga-sessions.ts";

function ev(seq: number, kind: "gamedatas" | "notif" = "notif"): BgaEvent {
  return { seq, kind, payload: { seq }, ts: 1_700_000_000_000 + seq };
}

describe("bga-sessions", () => {
  it("creates a session with code + token and reuses it for the same game", () => {
    const first = createOrReuseBgaSession("user-a", "7-wonders");
    expect(first.session.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(first.ingestToken.length).toBeGreaterThanOrEqual(20);

    const again = createOrReuseBgaSession("user-a", "7-wonders");
    expect(again.session.id).toBe(first.session.id);
    expect(again.ingestToken).toBe(first.ingestToken);

    expect(getActiveBgaSession("user-a")?.id).toBe(first.session.id);
    expect(getBgaSessionByCode(first.session.code.toLowerCase())?.id).toBe(first.session.id);
  });

  it("rejects an unknown or forged ingest token", () => {
    expect(ingestBgaEvents("not-a-real-token-at-all-1234", [ev(0)])).toMatchObject({
      ok: false,
      status: 401,
    });
    // Well-formed shape but a bad signature must not verify.
    const forged = `${Buffer.from('{"u":"attacker","g":"7-wonders"}').toString("base64url")}.deadbeef`;
    expect(ingestBgaEvents(forged, [ev(0)])).toMatchObject({ ok: false, status: 401 });
  });

  it("self-heals: a valid token re-ingests into a stable session across reconnects", () => {
    // Deterministic credentials mean a second create (e.g. after a restart)
    // yields the same token/id, and that token keeps ingesting.
    const first = createOrReuseBgaSession("user-heal", "7-wonders");
    ingestBgaEvents(first.ingestToken, [ev(0, "gamedatas"), ev(1)]);
    const again = createOrReuseBgaSession("user-heal", "7-wonders");
    expect(again.session.id).toBe(first.session.id);
    expect(again.ingestToken).toBe(first.ingestToken);
    expect(ingestBgaEvents(again.ingestToken, [ev(2)])).toMatchObject({ ok: true, nextSeq: 3 });
  });

  it("ingests in order, dedupes replayed seqs and reports nextSeq", () => {
    const { ingestToken } = createOrReuseBgaSession("user-b", "7-wonders");
    const first = ingestBgaEvents(ingestToken, [ev(0, "gamedatas"), ev(1), ev(2)]);
    expect(first).toMatchObject({ ok: true, accepted: 3, nextSeq: 3 });

    // A retried batch overlaps already-accepted seqs.
    const retry = ingestBgaEvents(ingestToken, [ev(1), ev(2), ev(3)]);
    expect(retry).toMatchObject({ ok: true, accepted: 1, nextSeq: 4 });
  });

  it("accepts a new game's gamedatas even when its seq restarts below lastSeq", () => {
    const { session, ingestToken } = createOrReuseBgaSession("user-newgame", "7-wonders");
    // First game: seqs climb high.
    ingestBgaEvents(ingestToken, [ev(0, "gamedatas"), ev(1), ev(2), ev(3)]);
    expect(getBgaSessionLastSeq(session.id)).toBe(3);

    // New game: the producer (fresh page load) restarts its seq at 0.
    const res = ingestBgaEvents(ingestToken, [ev(0, "gamedatas"), ev(1)]);
    expect(res).toMatchObject({ ok: true });

    const replayed: BgaEvent[] = [];
    subscribeToBgaSession(session.id, (e) => replayed.push(e), -1)?.();
    // Buffer reset to the new game's checkpoint + its notif — not dedup-rejected.
    expect(replayed.map((e) => e.kind)).toEqual(["gamedatas", "notif"]);
    expect(replayed.map((e) => e.seq)).toEqual([0, 1]);
  });

  it("compacts the buffer on a gamedatas checkpoint and replays it to late joiners", () => {
    const { session, ingestToken } = createOrReuseBgaSession("user-c", "7-wonders");
    ingestBgaEvents(ingestToken, [ev(0, "gamedatas"), ev(1), ev(2)]);
    ingestBgaEvents(ingestToken, [ev(3, "gamedatas"), ev(4)]);

    const replayed: number[] = [];
    const unsubscribe = subscribeToBgaSession(session.id, (event) => replayed.push(event.seq), -1);
    expect(replayed).toEqual([3, 4]); // pre-checkpoint events are gone
    expect(getBgaSessionLastSeq(session.id)).toBe(4);

    // Live events flow to the subscriber; Last-Event-ID resume skips replayed ones.
    ingestBgaEvents(ingestToken, [ev(5)]);
    expect(replayed).toEqual([3, 4, 5]);
    unsubscribe?.();

    const resumed: number[] = [];
    subscribeToBgaSession(session.id, (event) => resumed.push(event.seq), 4)?.();
    expect(resumed).toEqual([5]);
  });

  it("re-creating for another user's game keeps sessions separate", () => {
    const a = createOrReuseBgaSession("user-d", "7-wonders");
    const b = createOrReuseBgaSession("user-e", "7-wonders");
    expect(a.session.id).not.toBe(b.session.id);
    expect(a.ingestToken).not.toBe(b.ingestToken);
  });
});
