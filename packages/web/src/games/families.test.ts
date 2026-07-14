import { describe, expect, it } from "vitest";
import { compareForHeadcount, coversWindow } from "../lib/bgg-format";
import { familyOf, getAllFamilies, groupForPresentation } from "./families";
import { games } from "./registry";

describe("familyOf", () => {
  it("returns null for a slug that doesn't belong to any family", () => {
    expect(familyOf("lost-cities")).toBeNull();
  });

  it("returns null for an unknown slug", () => {
    expect(familyOf("not-a-real-game")).toBeNull();
  });

  it("returns the same family info for every member of a known family", () => {
    // UNO Classic + UNO Flip + UNO Show 'Em No Mercy all carry family.id = "uno".
    const a = familyOf("uno");
    expect(a).not.toBeNull();
    if (a) {
      expect(a.id).toBe("uno");
      // Every member's family lookup returns the same FamilyInfo identity.
      for (const m of a.members) {
        const b = familyOf(m.slug);
        expect(b).toBe(a);
      }
    }
  });
});

describe("getAllFamilies", () => {
  it("returns families sorted alphabetically by canonical title", () => {
    const all = getAllFamilies();
    const titles = all.map((f) => f.canonical.title);
    const sorted = [...titles].sort((a, b) => a.localeCompare(b));
    expect(titles).toEqual(sorted);
  });

  it("every family's canonical is one of its members", () => {
    for (const f of getAllFamilies()) {
      expect(f.members).toContain(f.canonical);
    }
  });

  it("displayName is canonical.family.name when set, else canonical.title", () => {
    for (const f of getAllFamilies()) {
      const expected = f.canonical.family?.name ?? f.canonical.title;
      expect(f.displayName).toBe(expected);
    }
  });

  it("members are ordered canonical-first, then alphabetical", () => {
    for (const f of getAllFamilies()) {
      if (f.members.length <= 1) continue;
      expect(f.members[0]).toBe(f.canonical);
      const rest = f.members.slice(1).map((m) => m.title);
      const sortedRest = [...rest].sort((a, b) => a.localeCompare(b));
      expect(rest).toEqual(sortedRest);
    }
  });
});

describe("groupForPresentation", () => {
  it("yields singletons for non-family games (preserves input order)", () => {
    const input = games.filter((g) => !g.family).slice(0, 3);
    const units = groupForPresentation(input);
    expect(units).toHaveLength(input.length);
    units.forEach((u, i) => {
      expect(u.kind).toBe("single");
      if (u.kind === "single") expect(u.game).toBe(input[i]);
    });
  });

  it("collapses ≥2 visible family members into one family unit", () => {
    const unoFamily = familyOf("uno");
    if (!unoFamily) {
      // No UNO family yet — skip.
      return;
    }
    const input = unoFamily.members.slice(0, 2);
    const units = groupForPresentation(input);
    expect(units).toHaveLength(1);
    expect(units[0].kind).toBe("family");
    if (units[0].kind === "family") {
      expect(units[0].family.id).toBe(unoFamily.id);
      expect(units[0].visibleMembers).toHaveLength(2);
    }
  });

  it("a family with only one visible member appears as a single unit", () => {
    const unoFamily = familyOf("uno");
    if (!unoFamily) return;
    const input = [unoFamily.members[0]];
    const units = groupForPresentation(input);
    expect(units).toHaveLength(1);
    expect(units[0].kind).toBe("single");
  });

  it("anchors the unit on the first member in INPUT order, not on the canonical", () => {
    const fam = getAllFamilies().find((f) => f.members.length >= 2);
    if (!fam) return;
    const nonCanonical = fam.members.find((m) => m !== fam.canonical);
    if (!nonCanonical) return;

    // Feed the family in with a non-canonical member first — this is what a
    // sorted caller does when that sibling wins the sort (e.g. Codenames Duet
    // is "best at 2" on a two-player night, so it leads Codenames itself).
    const input = [nonCanonical, fam.canonical];
    const units = groupForPresentation(input);
    expect(units).toHaveLength(1);
    if (units[0].kind !== "family") throw new Error("expected a family unit");
    expect(units[0].anchor).toBe(nonCanonical);
    // Chip order stays canonical-first regardless of who anchored the unit.
    expect(units[0].visibleMembers[0]).toBe(fam.canonical);
  });

  it("the anchor is always one of the unit's visible members", () => {
    for (const fam of getAllFamilies()) {
      if (fam.members.length < 2) continue;
      const units = groupForPresentation([...fam.members].reverse());
      if (units[0].kind !== "family") throw new Error("expected a family unit");
      expect(units[0].visibleMembers).toContain(units[0].anchor);
    }
  });

  it("never repeats a family even if multiple of its members appear scattered", () => {
    const all = getAllFamilies();
    const fam = all.find((f) => f.members.length >= 2);
    if (!fam) return; // catalog has no multi-member families yet
    // Interleave two family members between unrelated singletons.
    const singletons = games.filter((g) => !g.family).slice(0, 2);
    const input = [fam.members[0], singletons[0], fam.members[1], singletons[1]];
    const units = groupForPresentation(input);
    const familyUnits = units.filter((u) => u.kind === "family");
    expect(familyUnits).toHaveLength(1);
  });
});

// Regression: a locked two-player night. Reported as "Gloomhaven, Codenames
// and Villainous come up as 'fits 2' although they got sorted to the front
// because they have a version of the game that is BEST AT 2."
//
// Each of those families owns one sibling that BGG rates best at exactly 2
// (Codenames: Duet, Gloomhaven: Jaws of the Lion, Villainous: Introduction to
// Evil) while the canonical is best at 6 / 3 / 3. The sibling wins the sort
// and pulls the family to the front; the card must then OPEN on that sibling,
// or it advertises the weaker canonical ("fits 2") in the slot the sibling
// earned.
describe("two-player night (RSVP carousel ordering)", () => {
  const LO = 2;
  const HI = 2;

  /** Mirrors `useRsvpAvailability`: filter to games covering the window, sort. */
  function rank(): ReturnType<typeof groupForPresentation> {
    const eligible = games
      .filter((g) => coversWindow(g, LO, HI))
      .sort((a, b) => compareForHeadcount(a, b, LO));
    return groupForPresentation(eligible);
  }

  it.each([
    ["codenames", "codenames-duet"],
    ["gloomhaven", "gloomhaven-jaws-of-the-lion"],
  ])("family %s anchors on %s, the sibling that is best at 2", (familyId, expectedSlug) => {
    const unit = rank().find((u) => u.kind === "family" && u.family.id === familyId);
    expect(unit).toBeDefined();
    if (unit?.kind !== "family") throw new Error(`expected ${familyId} to be a family unit`);

    // Precondition: the canonical really is the weaker fit — otherwise this
    // test would pass for the wrong reason.
    expect(unit.family.canonical.bgg.bestPlayerCount).not.toBe(LO);
    expect(unit.anchor.slug).toBe(expectedSlug);
    expect(unit.anchor.bgg.bestPlayerCount).toBe(LO);
  });

  it("a `New` sibling outranks a best-at-2 one, so Villainous anchors on the new base game", () => {
    const unit = rank().find((u) => u.kind === "family" && u.family.id === "villainous");
    if (unit?.kind !== "family") throw new Error("expected villainous to be a family unit");
    // Introduction to Evil is best at 2, but the base game is flagged New —
    // and New leads the whole list (see `compareForHeadcount`).
    expect(unit.anchor.slug).toBe("villainous");
    expect(unit.anchor.isNew).toBe(true);
    expect(unit.family.displayName).toBe("Villainous");
    expect(unit.anchor.title).toBe("Villainous: The Worst Takes it All");
  });

  it("every family unit anchors on its best-ranked visible member", () => {
    for (const unit of rank()) {
      if (unit.kind !== "family") continue;
      const best = [...unit.visibleMembers].sort((a, b) => compareForHeadcount(a, b, LO))[0];
      expect(unit.anchor).toBe(best);
    }
  });
});
