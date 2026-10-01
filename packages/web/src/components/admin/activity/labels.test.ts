import {
  ACTIVITY_TYPES,
  type ActivityType,
  PAGE_VIEW_PAGES,
  parseActivityMeta,
} from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import type { DescribeContext } from "./describe-context";
import { EVENT_LABELS } from "./event-labels";
import { describePageView, PAGE_LABELS } from "./page-labels";
import { describeSettingsChanges } from "./trainer-labels";

const ctx: DescribeContext = {
  subjectId: "u-me",
  nameOf: (id) => ({ "u-mel": "Melanie", "u-adm": "Mantas" })[id ?? ""],
  gameTitle: (slug) => ({ arcs: "Arcs", azul: "Azul" })[slug ?? ""],
};

/** A row's line, through the same narrowing the trail uses. */
function line<K extends ActivityType>(type: K, meta: Record<string, unknown>): string {
  return EVENT_LABELS[type].describe(parseActivityMeta(type, meta), ctx, {});
}

/** What an admin should never read: a user id, a lowercase slug, a JS leak. */
const RAW = /\bu-[a-z]+|\barcs\b|\bazul\b|undefined|null|NaN|\[object/;

describe("every activity type has words", () => {
  it.each(ACTIVITY_TYPES)("%s reads as a sentence even with an empty meta", (type) => {
    const text = line(type, {});
    expect(text.length).toBeGreaterThan(3);
    expect(text).not.toBe(type.replace(/-/g, " "));
    expect(text[0]).toBe(text[0]?.toUpperCase());
    expect(text).not.toMatch(RAW);
  });

  /** A realistic `detail` per page (default: a game slug). */
  const DETAIL: Partial<Record<(typeof PAGE_VIEW_PAGES)[number], string>> = {
    admin: "pre-register",
    night: "2026-10-03_2",
    "night-invite": "2026-10-03",
    "skill-spotlight": "u-mel",
    "skill-board": "int",
    "purchase-vote-announce": "3",
    "purchase-vote-reminder": "3",
    arrival: "a1",
  };

  it.each(PAGE_VIEW_PAGES)("page %s reads as a sentence with or without its detail", (page) => {
    const sample = page.startsWith("profile")
      ? "u-mel"
      : page.startsWith("trainer")
        ? "geography"
        : (DETAIL[page] ?? "arcs");
    for (const detail of [undefined, sample]) {
      const text = PAGE_LABELS[page](detail, ctx);
      expect(text[0]).toBe(text[0]?.toUpperCase());
      expect(text).not.toMatch(RAW);
    }
  });

  it("still reads a page this build has never heard of", () => {
    expect(describePageView("leaderboard-v2", "x", ctx)).toBe("Viewed leaderboard-v2 (x)");
  });
});

describe("wording", () => {
  it("names the trainers and what their settings changed", () => {
    expect(line("geography-train", { localDate: "2026-09-28" })).toBe(
      "Started the day's World Geography training",
    );
    expect(
      line("quiztopia-settings", {
        changes: {
          newPerDay: { from: 10, to: 15 },
          language: { from: "en", to: "de" },
        },
      }),
    ).toBe(
      "Changed Quiztopia trainer settings: new questions a day 10 → 15, language English → German",
    );
    expect(line("geography-settings", { language: "en", newPerDay: 5 })).toBe(
      "Saved World Geography trainer settings",
    );
    expect(line("quiztopia-reset", { states: 3, reviews: 1, reads: 0 })).toBe(
      "Reset their Quiztopia progress (1 review deleted)",
    );
  });

  it("caps a long settings diff", () => {
    expect(
      describeSettingsChanges("geography", {
        focus: { from: null, to: "eu" },
        includeLeeches: { from: false, to: true },
        directions: { from: "both", to: "locate" },
        language: { from: "en", to: "de" },
      }),
    ).toBe(
      "continent focus none → Europe, leeches off → on, directions both ways → find on the map, +1 more change",
    );
  });

  it("describes greeting answers with what the card was about", () => {
    expect(
      line("greeting-response", { kind: "spotlight", action: "later", subjectUserId: "u-mel" }),
    ).toBe("Dismissed the group spotlight about Melanie");
    expect(line("greeting-response", { kind: "purchase-vote-reminder", action: "cta" })).toBe(
      "Followed the purchase-vote reminder to the vote screen",
    );
  });

  it("says who removed a game from a collection", () => {
    expect(line("ownership-removed", { slug: "arcs", by: "u-me" })).toBe(
      "Removed Arcs from their collection",
    );
    expect(line("ownership-removed", { slug: "arcs", by: "u-adm" })).toBe(
      "Mantas removed Arcs from their collection",
    );
  });

  it("uses game titles, not slugs", () => {
    expect(line("ownership-resolved", { action: "approve", slug: "azul" })).toBe(
      "Had their claim to own Azul approved",
    );
    expect(line("played-through", { slug: "arcs", playedThrough: true })).toBe(
      "Marked Arcs as played through",
    );
  });

  it("names the owner of a profile page, and the member's own", () => {
    expect(PAGE_LABELS.profile("u-mel", ctx)).toBe("Viewed Melanie's profile");
    expect(PAGE_LABELS["profile-collection"]("u-me", ctx)).toBe("Viewed their own collection");
    expect(PAGE_LABELS["profile-skill"]("u-ghost", ctx)).toBe("Viewed a member's skill page");
  });

  it("tells the game shell's modes and trainers apart", () => {
    expect(PAGE_LABELS["play-lobby"]("azul", ctx)).toBe("Joined a lobby for Azul");
    expect(PAGE_LABELS["play-solo"]("arcs", ctx)).toBe("Started a solo game of Arcs");
    expect(PAGE_LABELS["trainer-study"]("quiztopia", ctx)).toBe("Started studying Quiztopia");
    expect(PAGE_LABELS.trainer("geography", ctx)).toBe("Opened the World Geography trainer");
  });
});
