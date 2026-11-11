import type { SiteStatus } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { ApiError } from "./api-fetch.ts";
import { isHibernatedError, openWhileHibernated } from "./site.ts";

const base: SiteStatus = {
  hibernated: true,
  since: "2026-11-11T20:00:00.000Z",
  memorial: null,
  onlineAccess: false,
  admin: false,
};
const offline = base;
const online = { ...base, onlineAccess: true };
const admin = { ...base, onlineAccess: true, admin: true };

describe("openWhileHibernated", () => {
  it.each([
    ["/", offline, false],
    ["/offline", online, false],
    ["/history", admin, false],
    ["/u/x/matches", online, false],
    ["/settings", online, false],
    ["/games", offline, false],
    ["/games", online, true],
    ["/play/lost-cities/solo", online, true],
    ["/trainer/quiz", online, true],
    ["/go/review", online, true],
    ["/gamesx", online, false],
    ["/admin", online, false],
    ["/admin", admin, true],
    ["/admin/quiz-desk", admin, true],
    ["/login", offline, true],
    ["/reset-password", offline, true],
  ] as const)("%s → %s", (path, status, open) => {
    expect(openWhileHibernated(path, status)).toBe(open);
  });
});

describe("isHibernatedError", () => {
  it("recognises the gate's 503", () => {
    expect(isHibernatedError(new ApiError(503, "asleep", "HIBERNATED"))).toBe(true);
  });
  it("ignores any other failure", () => {
    expect(isHibernatedError(new ApiError(503, "down"))).toBe(false);
    expect(isHibernatedError(new ApiError(403, "no", "HIBERNATED"))).toBe(false);
    expect(isHibernatedError(new Error("boom"))).toBe(false);
  });
});
