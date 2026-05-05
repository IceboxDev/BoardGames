import { games } from "./registry";
import type { GameDefinition } from "./types";

/**
 * Information about a single family — the canonical (representative) member
 * plus all members in display order. Built once at module load by reading
 * the `family` declarations on every game in the registry.
 *
 * Display order: canonical first, then alphabetical by title. Stable per
 * registry-load. If a family has no canonical declared, the first member by
 * registry sort order is promoted.
 */
export type FamilyInfo = {
  id: string;
  canonical: GameDefinition;
  members: GameDefinition[];
};

/**
 * A "presentation unit" is what a browsing view (gallery / inventory /
 * carousel) actually paints: either a singleton game cell, or a family card
 * standing in for ≥2 visible siblings. Views switch on `kind` to pick the
 * right component.
 */
export type PresentationUnit =
  | { kind: "single"; game: GameDefinition }
  | { kind: "family"; family: FamilyInfo; visibleMembers: GameDefinition[] };

const familyMap = new Map<string, FamilyInfo>();
const slugToFamilyId = new Map<string, string>();

for (const g of games) {
  if (!g.family) continue;
  slugToFamilyId.set(g.slug, g.family.id);
  let info = familyMap.get(g.family.id);
  if (!info) {
    info = { id: g.family.id, canonical: g, members: [g] };
    familyMap.set(g.family.id, info);
    continue;
  }
  info.members.push(g);
  if (g.family.canonical) {
    if (info.canonical.family?.canonical && info.canonical !== g) {
      // Two members both claim canonical — keep the first one (already in
      // info.canonical) and warn so it gets fixed.
      console.warn(
        `[families] family "${g.family.id}" has multiple canonical members; using "${info.canonical.slug}", ignoring "${g.slug}"`,
      );
    } else {
      info.canonical = g;
    }
  }
}

// Stable per-family member order: canonical first, then alphabetical.
for (const info of familyMap.values()) {
  info.members.sort((a, b) => {
    if (a === info.canonical) return -1;
    if (b === info.canonical) return 1;
    return a.title.localeCompare(b.title);
  });
}

/** Returns the family of a given slug, or null if it's a singleton. */
export function familyOf(slug: string): FamilyInfo | null {
  const id = slugToFamilyId.get(slug);
  return id ? (familyMap.get(id) ?? null) : null;
}

/** All known families, stable order (alphabetical by canonical title). */
export function getAllFamilies(): FamilyInfo[] {
  return [...familyMap.values()].sort((a, b) => a.canonical.title.localeCompare(b.canonical.title));
}

/**
 * Project a list of games into presentation units.
 * - A family with ≥2 members in the input → one `family` unit.
 * - A family with 1 member in the input or a non-family game → `single`.
 *
 * Output preserves input order, anchoring each family unit at the position
 * of its first-seen member.
 */
export function groupForPresentation(input: GameDefinition[]): PresentationUnit[] {
  const inputSet = new Set(input.map((g) => g.slug));
  const seenFamilies = new Set<string>();
  const units: PresentationUnit[] = [];

  for (const g of input) {
    const fam = g.family ? familyMap.get(g.family.id) : null;
    if (!fam) {
      units.push({ kind: "single", game: g });
      continue;
    }
    if (seenFamilies.has(fam.id)) continue;
    seenFamilies.add(fam.id);
    const visible = fam.members.filter((m) => inputSet.has(m.slug));
    if (visible.length >= 2) {
      units.push({ kind: "family", family: fam, visibleMembers: visible });
    } else if (visible.length === 1) {
      units.push({ kind: "single", game: visible[0] });
    }
  }

  return units;
}
