// `/api/health` reports the database's reachability, not just the process's.
// The probe must say "ok" for a live database and "down" for one it cannot
// reach, within its deadline, so an orchestrator polling the healthcheck
// restarts the container instead of trusting a green answer.

import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { probeDb } from "./db.ts";

describe("probeDb", () => {
  it("reports a reachable database with its latency", async () => {
    const client = createClient({ url: ":memory:" });
    try {
      const probe = await probeDb(client);
      expect(probe.ok).toBe(true);
      expect(probe.ms).toBeGreaterThanOrEqual(0);
    } finally {
      client.close();
    }
  });

  it("reports an unreachable database instead of throwing", async () => {
    // `.invalid` never resolves (RFC 2606), so this fails fast at DNS.
    const client = createClient({ url: "libsql://db-down.invalid", authToken: "x" });
    try {
      const probe = await probeDb(client);
      expect(probe.ok).toBe(false);
      if (!probe.ok) expect(probe.error.length).toBeGreaterThan(0);
    } finally {
      client.close();
    }
  });

  it("reports a closed client as down", async () => {
    const client = createClient({ url: ":memory:" });
    client.close();
    const probe = await probeDb(client);
    expect(probe.ok).toBe(false);
  });
});
