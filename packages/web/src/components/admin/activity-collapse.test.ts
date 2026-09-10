import type { ActivityEntry } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { collapseEntries, ctaDestinationLabel } from "./activity-collapse";

let nextId = 100;
function entry(type: string, meta: Record<string, unknown>, createdAt: string): ActivityEntry {
  return { id: nextId--, type, meta, createdAt };
}

describe("collapseEntries", () => {
  it("folds the vote screen's page view into the announcement's 'followed' line", () => {
    // Newest first, as the API returns them.
    const entries = [
      entry("page-view", { page: "purchase-vote-reminder" }, "2026-09-07 14:40:20"),
      entry("page-view", { page: "purchase-vote" }, "2026-09-07 14:40:02"),
      entry(
        "greeting-response",
        { kind: "purchase-vote-announce", action: "cta" },
        "2026-09-07 14:40:01",
      ),
      entry("page-view", { page: "purchase-vote-announce" }, "2026-09-07 14:39:50"),
      entry("login", {}, "2026-09-07 14:39:10"),
    ];
    const kept = collapseEntries(entries).map((e) => `${e.type}:${e.meta.page ?? e.meta.action}`);
    expect(kept).toEqual([
      "page-view:purchase-vote-reminder",
      "greeting-response:cta",
      "page-view:purchase-vote-announce",
      "login:undefined",
    ]);
  });

  it("also folds a page view that raced ahead of its ack", () => {
    const entries = [
      entry(
        "greeting-response",
        { kind: "purchase-vote-announce", action: "cta" },
        "2026-09-07 14:40:02",
      ),
      entry("page-view", { page: "purchase-vote" }, "2026-09-07 14:40:02"),
    ];
    expect(collapseEntries(entries).map((e) => e.type)).toEqual(["greeting-response"]);
  });

  it("leaves unrelated, distant or dismissed rows alone", () => {
    const entries = [
      entry("page-view", { page: "purchase-vote" }, "2026-09-07 15:10:00"),
      entry(
        "greeting-response",
        { kind: "purchase-vote-announce", action: "later" },
        "2026-09-07 14:40:01",
      ),
      entry("page-view", { page: "purchase-vote" }, "2026-09-07 14:30:00"),
      entry(
        "greeting-response",
        { kind: "purchase-vote-announce", action: "cta" },
        "2026-09-07 14:20:00",
      ),
    ];
    expect(collapseEntries(entries)).toHaveLength(4);
  });

  it("names where each button leads", () => {
    expect(ctaDestinationLabel("purchase-vote-announce")).toBe("the vote screen");
    expect(ctaDestinationLabel("spotlight")).toBe("their skill page");
    expect(ctaDestinationLabel("skill-intro")).toBeUndefined();
  });
});
