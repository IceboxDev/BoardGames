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

  it("rejects an unknown ingest token", () => {
    const result = ingestBgaEvents("not-a-real-token-at-all-1234", [ev(0)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("ingests in order, dedupes replayed seqs and reports nextSeq", () => {
    const { ingestToken } = createOrReuseBgaSession("user-b", "7-wonders");
    const first = ingestBgaEvents(ingestToken, [ev(0, "gamedatas"), ev(1), ev(2)]);
    expect(first).toMatchObject({ ok: true, accepted: 3, nextSeq: 3 });

    // A retried batch overlaps already-accepted seqs.
    const retry = ingestBgaEvents(ingestToken, [ev(1), ev(2), ev(3)]);
    expect(retry).toMatchObject({ ok: true, accepted: 1, nextSeq: 4 });
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
