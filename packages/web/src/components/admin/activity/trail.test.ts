import type { ActivityEntry } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import type { DescribeContext } from "./describe-context";
import { buildTrail, entryTime } from "./trail";

// Rows are written OLDEST FIRST here (the order things happened) and handed to
// `buildTrail` newest-first, the way the API returns them.

const MELANIE = "u-mel";
const ctx: DescribeContext = {
  subjectId: "u-me",
  nameOf: (id) => ({ [MELANIE]: "Melanie Eghbalian", "u-me": "Lina" })[id ?? ""],
  gameTitle: (slug) => ({ arcs: "Arcs", quiztopia: "Quiztopia" })[slug ?? ""],
};

const T0 = Date.parse("2026-09-28T17:09:00Z");
let nextId = 1;

/** A current row: stamped `ms` after T0. */
function row(type: string, meta: Record<string, unknown>, ms: number): ActivityEntry {
  return {
    id: nextId++,
    type,
    meta,
    createdAt: "2026-09-28 17:09:00",
    occurredAtMs: T0 + ms,
  };
}

/** A legacy row: second-resolution `created_at`, no event stamp. */
function legacy(type: string, meta: Record<string, unknown>, createdAt: string): ActivityEntry {
  return { id: nextId++, type, meta, createdAt };
}

function trail(oldestFirst: ActivityEntry[]): string[] {
  return buildTrail([...oldestFirst].reverse(), ctx).map(
    (l) => l.text + (l.count > 1 ? ` ×${l.count}` : ""),
  );
}

describe("buildTrail — legacy rows (logged before 2026-09-28)", () => {
  it("reads the reported spotlight sequence as the one thing that happened", () => {
    // What the admin saw: "Was shown the group spotlight / Viewed Melanie
    // Eghbalian's profile / Clicked away the group spotlight". The profile row
    // was the card fetching Melanie's accent colour, not a visit.
    expect(
      trail([
        legacy("page-view", { page: "skill-spotlight" }, "2026-09-20 17:09:01"),
        legacy("profile-view", { targetUserId: MELANIE }, "2026-09-20 17:09:01"),
        legacy(
          "greeting-response",
          { kind: "spotlight", action: "later", greetingId: 4 },
          "2026-09-20 17:09:09",
        ),
      ]),
    ).toEqual(["Dismissed the group spotlight about Melanie Eghbalian"]);
  });

  it("drops the profile row a profile sub-page's own fetch logged, keeps a real profile visit", () => {
    expect(
      trail([
        legacy("page-view", { page: "profile-skill", detail: MELANIE }, "2026-09-20 10:00:00"),
        legacy("profile-view", { targetUserId: MELANIE }, "2026-09-20 10:00:00"),
        legacy("page-view", { page: "games" }, "2026-09-20 10:05:00"),
        legacy("profile-view", { targetUserId: MELANIE }, "2026-09-20 10:06:00"),
      ]),
    ).toEqual([
      "Viewed Melanie Eghbalian's profile",
      "Browsed the games catalog",
      "Viewed Melanie Eghbalian's skill page",
    ]);
  });

  it("folds the vote screen's page view into the announcement's 'followed' line", () => {
    expect(
      trail([
        legacy("login", {}, "2026-09-07 14:39:10"),
        legacy("page-view", { page: "purchase-vote-announce" }, "2026-09-07 14:39:50"),
        legacy(
          "greeting-response",
          { kind: "purchase-vote-announce", action: "cta" },
          "2026-09-07 14:40:01",
        ),
        legacy("page-view", { page: "purchase-vote" }, "2026-09-07 14:40:02"),
        legacy("page-view", { page: "purchase-vote-reminder" }, "2026-09-07 14:40:20"),
      ]),
    ).toEqual([
      "Saw the purchase-vote reminder",
      "Followed the purchase-vote announcement to the vote screen",
      "Signed in",
    ]);
  });

  it("also folds a destination that raced ahead of its ack", () => {
    expect(
      trail([
        legacy("page-view", { page: "purchase-vote" }, "2026-09-07 14:40:02"),
        legacy(
          "greeting-response",
          { kind: "purchase-vote-announce", action: "cta" },
          "2026-09-07 14:40:02",
        ),
      ]),
    ).toEqual(["Followed the purchase-vote announcement to the vote screen"]);
  });

  it("leaves unrelated, distant or dismissed rows alone", () => {
    expect(
      trail([
        legacy(
          "greeting-response",
          { kind: "purchase-vote-announce", action: "cta" },
          "2026-09-07 14:20:00",
        ),
        legacy("page-view", { page: "purchase-vote" }, "2026-09-07 14:30:00"),
        legacy(
          "greeting-response",
          { kind: "purchase-vote-announce", action: "later" },
          "2026-09-07 14:40:01",
        ),
        legacy("page-view", { page: "purchase-vote" }, "2026-09-07 15:10:00"),
      ]),
    ).toEqual([
      "Opened the purchase-vote screen",
      "Dismissed the purchase-vote announcement",
      "Opened the purchase-vote screen",
      "Followed the purchase-vote announcement to the vote screen",
    ]);
  });

  it("folds an arrival's CTA with whichever screen it opened", () => {
    expect(
      trail([
        legacy("greeting-response", { kind: "arrival", action: "cta" }, "2026-09-10 12:00:01"),
        legacy("page-view", { page: "games" }, "2026-09-10 12:00:02"),
      ]),
    ).toEqual(["Followed the arrivals announcement to the games catalog"]);
    expect(
      trail([
        legacy("greeting-response", { kind: "arrival", action: "cta" }, "2026-09-10 12:00:01"),
        legacy("page-view", { page: "profile-collection", detail: "u-me" }, "2026-09-10 12:00:02"),
      ]),
    ).toEqual(["Followed the arrivals announcement to their own collection"]);
  });
});

describe("buildTrail — current rows", () => {
  it("names the page a button opened from its `via`, even with rows in between", () => {
    expect(
      trail([
        row("page-view", { page: "skill-spotlight", detail: MELANIE }, 0),
        row("greeting-response", { kind: "spotlight", action: "cta", subjectUserId: MELANIE }, 900),
        row("visit", {}, 950),
        row(
          "page-view",
          { page: "profile-skill", detail: MELANIE, via: "greeting:spotlight" },
          1000,
        ),
      ]),
    ).toEqual([
      "Visited the site",
      "Followed the group spotlight to Melanie Eghbalian's skill page",
    ]);
  });

  it("does not fold a page the member opened on their own", () => {
    expect(
      trail([
        row("greeting-response", { kind: "spotlight", action: "cta", subjectUserId: MELANIE }, 0),
        row("page-view", { page: "profile-skill", detail: MELANIE, via: "greeting:spotlight" }, 50),
        row("page-view", { page: "profile-skill", detail: MELANIE }, 20_000),
      ]),
    ).toEqual([
      "Viewed Melanie Eghbalian's skill page",
      "Followed the group spotlight to Melanie Eghbalian's skill page",
    ]);
  });

  it("says where a button leads when the destination wasn't logged", () => {
    expect(
      trail([
        row("greeting-response", { kind: "night-invite", action: "cta", date: "2026-10-03" }, 0),
      ]),
    ).toEqual([`Followed the invitation to the ${dayLabel("2026-10-03")} private night`]);
    expect(
      trail([
        row("greeting-response", { kind: "spotlight", action: "cta", subjectUserId: MELANIE }, 0),
      ]),
    ).toEqual(["Followed the group spotlight to Melanie Eghbalian's skill page"]);
  });

  it("keeps a card that was shown and never answered", () => {
    expect(trail([row("page-view", { page: "skill-spotlight", detail: MELANIE }, 0)])).toEqual([
      "Saw the group spotlight about Melanie Eghbalian",
    ]);
  });

  it("orders by event time, not by id", () => {
    const later = row("page-view", { page: "games" }, 500);
    const earlier = row("page-view", { page: "home" }, 100);
    // Newest-first as the API sorts; ids deliberately inverted.
    expect(buildTrail([later, earlier], ctx).map((l) => l.text)).toEqual([
      "Browsed the games catalog",
      "Opened the home page",
    ]);
  });

  it("counts real repeats and swallows a look reported twice", () => {
    expect(
      trail([
        row("page-view", { page: "home" }, 0),
        row("page-view", { page: "games" }, 60_000),
        row("page-view", { page: "home" }, 120_000),
        row("page-view", { page: "games" }, 180_000),
        row("page-view", { page: "games" }, 240_000),
        row("page-view", { page: "night", detail: "2026-10-03" }, 300_000),
        row("page-view", { page: "night", detail: "2026-10-03" }, 303_000),
      ]),
    ).toEqual([
      `Opened the ${dayLabel("2026-10-03")} game night`,
      "Browsed the games catalog ×2",
      "Opened the home page",
      "Browsed the games catalog",
      "Opened the home page",
    ]);
  });

  it("keeps each repeat's time, and a duplicate report's first time", () => {
    const lines = buildTrail(
      [
        row("page-view", { page: "games" }, 125_000),
        row("page-view", { page: "games" }, 120_000),
        row("page-view", { page: "games" }, 0),
      ],
      ctx,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.count).toBe(2);
    expect(lines[0]?.times).toEqual([T0 + 120_000, T0]);
  });

  it("carries every folded row id, newest first", () => {
    const shown = row("page-view", { page: "skill-spotlight", detail: MELANIE }, 0);
    const answer = row("greeting-response", { kind: "spotlight", action: "cta" }, 10);
    const opened = row(
      "page-view",
      { page: "profile-skill", detail: MELANIE, via: "greeting:spotlight" },
      20,
    );
    const [line] = buildTrail([opened, answer, shown], ctx);
    expect(line?.ids).toEqual([opened.id, answer.id, shown.id]);
    expect(line?.at).toBe(T0 + 10);
  });

  it("renders a type this build doesn't know without breaking", () => {
    expect(trail([row("chess-puzzle-solved", { n: 3 }, 0)])).toEqual([
      "chess puzzle solved (unrecognised activity)",
    ]);
  });
});

describe("entryTime", () => {
  it("prefers the event stamp and falls back to the insert second", () => {
    expect(entryTime(row("login", {}, 5))).toBe(T0 + 5);
    expect(entryTime(legacy("login", {}, "2026-09-28 17:09:00"))).toBe(T0);
  });
});

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
