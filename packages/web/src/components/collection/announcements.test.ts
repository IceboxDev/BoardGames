import type { Announcement } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { RESOLVED_SHOWN_DAYS, visibleAnnouncements } from "./announcements.ts";

const NOW = Date.parse("2026-11-01T12:00:00Z");

function ann(id: string, status: Announcement["status"], resolvedAt: string | null): Announcement {
  return {
    id,
    userId: "u1",
    userName: null,
    slug: "bomb-busters",
    freeTextName: null,
    note: null,
    status,
    resolutionSlug: null,
    resolvedBy: status === "pending" ? null : "admin",
    resolvedAt,
    createdAt: "2026-09-10 11:24:18",
  };
}

describe("visibleAnnouncements", () => {
  it("keeps every pending announcement and a resolved one only for two weeks", () => {
    const { pending, resolved } = visibleAnnouncements(
      [
        ann("p", "pending", null),
        ann("fresh", "approved", "2026-10-25 09:00:00"),
        ann("old", "approved", "2026-09-10 11:24:18"),
      ],
      NOW,
    );
    expect(RESOLVED_SHOWN_DAYS).toBe(14);
    expect(pending.map((a) => a.id)).toEqual(["p"]);
    expect(resolved.map((a) => a.id)).toEqual(["fresh"]);
  });

  it("shows at most the last three resolved", () => {
    const recent = ["a", "b", "c", "d"].map((id) => ann(id, "dismissed", "2026-10-31 10:00:00"));
    expect(visibleAnnouncements(recent, NOW).resolved.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });
});
