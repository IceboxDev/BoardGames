import type { OutstandingItem } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { outstandingLabel, reminderText } from "./outstanding-copy";

const ALL: OutstandingItem[] = [
  { kind: "rsvp", dateKey: "2026-11-29", title: null, reason: "unconfirmed" },
  { kind: "rsvp", dateKey: "2026-12-04", title: null, reason: "maybe" },
  { kind: "invite", dateKey: "2026-12-05_2", title: "TI4" },
  { kind: "vote", dateKey: "2026-11-29", title: null },
  { kind: "stale-votes", dateKey: "2026-11-29", title: null, count: 1 },
  { kind: "exit-vote", dateKey: "2026-11-29", title: null },
  { kind: "purchase-vote", pollId: 1, title: "Winter haul", votesLeft: 1, votesTotal: 3 },
  { kind: "host-details", dateKey: "2026-11-29", title: null, missing: ["time", "address"] },
  { kind: "collection" },
];

describe("outstandingLabel", () => {
  it("words every kind without raw ids", () => {
    for (const item of ALL) {
      const { title } = outstandingLabel(item);
      expect(title).not.toMatch(/2026-|_2|undefined|null/);
    }
  });

  it("names a private night by its title and says what a host is missing", () => {
    expect(outstandingLabel(ALL[2] as OutstandingItem).title).toMatch(
      /^Answer the invite · TI4 \(/,
    );
    expect(outstandingLabel(ALL[7] as OutstandingItem).title).toMatch(
      /^Add the start time and address · /,
    );
    expect(outstandingLabel(ALL[4] as OutstandingItem).detail).toBe(
      "1 vote cast at an old headcount",
    );
  });
});

describe("reminderText", () => {
  it("greets by first name and lists blank days, items, then open notes", () => {
    const text = reminderText({
      name: "Klaudia Wachal",
      blankDays: 37,
      items: [ALL[0] as OutstandingItem, ALL[6] as OutstandingItem],
      notes: [
        { text: "Bring back Brass", doneAt: null },
        { text: "Paid", doneAt: "2026-11-20" },
      ],
      origin: "https://example.com",
    });
    const lines = text?.split("\n") ?? [];
    expect(lines[0]).toBe("Hey Klaudia! A few things still open for game night:");
    expect(lines[1]).toBe("• Mark which days you can make — 37 days still blank");
    expect(lines[2]).toMatch(/^• Confirm whether you're coming on /);
    expect(lines[3]).toBe("• Cast your 1 remaining purchase vote");
    expect(lines[4]).toBe("• Bring back Brass");
    expect(lines[5]).toBe("https://example.com/offline");
    expect(lines).toHaveLength(6);
  });

  it("is null when nothing is owed", () => {
    expect(
      reminderText({ name: "", blankDays: 0, items: [], notes: [], origin: "https://x" }),
    ).toBeNull();
  });
});
