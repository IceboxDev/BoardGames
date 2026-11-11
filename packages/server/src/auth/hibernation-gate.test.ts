// The hibernation gate: who gets through what while the site sleeps, and the
// guarantee that every route the server mounts is classified on purpose.

import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { SiteState } from "../lib/site-state.ts";
import {
  allowedWhileHibernated,
  classifyPath,
  createHibernationGate,
  type GateUser,
  HIBERNATION_POLICY,
} from "./hibernation-gate.ts";

const ADMIN: GateUser = { role: "admin", onlineMode: "offline" };
const ONLINE: GateUser = { role: "user", onlineMode: "online" };
const BOTH: GateUser = { role: "user", onlineMode: "both" };
const OFFLINE: GateUser = { role: "user", onlineMode: "offline" };
const NOBODY = null;

const ASLEEP: SiteState = { hibernatedAt: "2026-11-11T20:00:00.000Z", memorial: null };
const AWAKE: SiteState = { hibernatedAt: null, memorial: null };

function app(state: SiteState, user: GateUser | null) {
  const a = new Hono();
  a.use("*", createHibernationGate({ getState: async () => state, resolveUser: async () => user }));
  a.all("*", (c) => c.text("ok"));
  return a;
}

describe("classifyPath", () => {
  it("takes the longest matching prefix", () => {
    expect(classifyPath("/api/user/availability")).toBe("frozen");
    expect(classifyPath("/api/user/availability/2026-11")).toBe("frozen");
    expect(classifyPath("/api/user/inventory/owners")).toBe("online");
    expect(classifyPath("/api/bga-ingest/x")).toBe("token");
    expect(classifyPath("/api/bga/session")).toBe("online");
  });

  it("matches whole segments only", () => {
    expect(classifyPath("/api/health")).toBe("open");
    expect(classifyPath("/api/healthy")).toBe("online");
  });

  it("treats unknown paths as online-only (the safe side)", () => {
    expect(classifyPath("/api/something-new")).toBe("online");
  });
});

describe("allowedWhileHibernated", () => {
  const table: [string, GateUser | null, boolean][] = [
    ["/api/health", NOBODY, true],
    ["/api/auth/sign-in/email", NOBODY, true],
    ["/api/site/status", NOBODY, true],
    ["/api/ical/feed/x/calendar.ics", NOBODY, true],
    ["/api/chess-farm/claim", NOBODY, true],
    ["/api/calendar/rsvp", OFFLINE, false],
    ["/api/calendar/rsvp", BOTH, false],
    ["/api/calendar/rsvp", ADMIN, true],
    ["/api/history/matches", ONLINE, false],
    ["/api/games/lost-cities", OFFLINE, false],
    ["/api/games/lost-cities", NOBODY, false],
    ["/api/games/lost-cities", ONLINE, true],
    ["/api/games/lost-cities", BOTH, true],
    ["/api/games/lost-cities", ADMIN, true],
    ["/api/profiles/me", ONLINE, true],
    ["/api/profiles/me", OFFLINE, false],
    ["/ws", OFFLINE, false],
    ["/ws", ONLINE, true],
  ];
  it.each(table)("%s for %o → %s", (path, user, expected) => {
    expect(allowedWhileHibernated(classifyPath(path), user)).toBe(expected);
  });

  it("fails closed on a user without a known mode", () => {
    expect(allowedWhileHibernated("online", { role: "user", onlineMode: undefined })).toBe(false);
    expect(allowedWhileHibernated("online", { role: "user", onlineMode: "weird" })).toBe(false);
  });
});

describe("createHibernationGate", () => {
  it("does nothing while awake", async () => {
    const res = await app(AWAKE, NOBODY).request("/api/calendar/rsvp");
    expect(res.status).toBe(200);
  });

  it("answers 503 HIBERNATED to a blocked request", async () => {
    const res = await app(ASLEEP, OFFLINE).request("/api/calendar/rsvp", { method: "POST" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "The site is hibernating.", code: "HIBERNATED" });
  });

  it("lets an online member into the online area", async () => {
    const res = await app(ASLEEP, ONLINE).request("/api/trainers/quiz/today");
    expect(res.status).toBe(200);
  });

  it("never looks the user up for open paths", async () => {
    let lookups = 0;
    const a = new Hono();
    a.use(
      "*",
      createHibernationGate({
        getState: async () => ASLEEP,
        resolveUser: async () => {
          lookups++;
          return null;
        },
      }),
    );
    a.all("*", (c) => c.text("ok"));
    expect((await a.request("/api/health")).status).toBe(200);
    expect(lookups).toBe(0);
  });
});

describe("HIBERNATION_POLICY covers the server", () => {
  it("classifies every prefix server.ts mounts", () => {
    const source = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    const mounted = new Set<string>();
    for (const m of source.matchAll(/app\.(?:route|use|get|post|all)\(\s*"([^"]+)"/g)) {
      const path = (m[1] ?? "").replace(/\/\*$/, "");
      if (path === "/api" || path === "*") continue;
      mounted.add(path);
    }
    for (const m of source.matchAll(/const \w+_PATH = "([^"]+)"/g)) mounted.add(m[1] ?? "");
    expect(mounted.size).toBeGreaterThan(30);
    const unclassified = [...mounted].filter(
      (p) => !Object.keys(HIBERNATION_POLICY).some((k) => p === k || p.startsWith(`${k}/`)),
    );
    expect(unclassified, "add these to HIBERNATION_POLICY").toEqual([]);
  });
});
