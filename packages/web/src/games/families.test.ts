import { describe, expect, it } from "vitest";
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
