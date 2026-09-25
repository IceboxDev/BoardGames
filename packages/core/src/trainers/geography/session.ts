import { hashSeed } from "../../games/quiztopia/ids.ts";
import { isLeech, type SrsState, seededShuffle } from "../srs.ts";
import { cardId, type GeoCatalog, parseCardId, type Stage } from "./catalog.ts";
import type { ContinentId, Place } from "./content-types.ts";
import {
  currentStage,
  inProgress,
  type LadderSettings,
  newPlaceFrontier,
  placeDone,
} from "./ladder.ts";

// Today's session. Three kinds of card, in this order:
//   1. reviews — places through all four stages come back in their two
//      borderless forms (stage 3 and 4) when due, shuffled;
//   2. places in progress — each one's next stage;
//   3. new places — stage 1 (borders and name shown: the easiest test is
//      also the lesson), a whole group at a time, no daily cap.
// Clearing a stage during the session queues the next one at the end, so a
// batch of new places climbs its stages together: all stage 1s, then all
// stage 2s, and so on.

export type GeoSessionSettings = LadderSettings;

export interface GeoSessionItem {
  cardId: string;
  placeId: string;
  stage: Stage;
  tier: "review" | "stage" | "new";
  state: SrsState | null;
}

export interface GeoSessionInput {
  catalog: GeoCatalog;
  states: readonly SrsState[];
  settings: GeoSessionSettings;
  today: string;
  /** Per user, so two members don't get the same order. */
  seedKey: string;
  /** Most reviews in one session (stages and new places always come). */
  limit?: number;
  includeLeeches?: boolean;
  /**
   * Which new group to start: an `OpenGroup` id, null for none (just
   * continue and review), or leave it out for the suggestion.
   */
  group?: string | null;
}

const DEFAULT_LIMIT = 100;

export function buildGeoSession(input: GeoSessionInput): GeoSessionItem[] {
  const { catalog, settings, today } = input;
  const byCard = new Map(input.states.map((s) => [s.questionId, s]));
  const seen = new Set<string>();
  const item = (placeId: string, stage: Stage, tier: GeoSessionItem["tier"]): GeoSessionItem => {
    seen.add(placeId);
    const id = cardId(placeId, stage);
    return { cardId: id, placeId, stage, tier, state: byCard.get(id) ?? null };
  };

  // 1. Reviews: the borderless stages of finished places.
  const reviews: GeoSessionItem[] = [];
  for (const s of input.states) {
    const parsed = parseCardId(s.questionId);
    if (!parsed || parsed.stage < 3 || s.dueDate > today) continue;
    if (!catalog.byId.has(parsed.placeId) || !placeDone(byCard, parsed.placeId)) continue;
    if (!input.includeLeeches && isLeech(s)) continue;
    reviews.push({
      cardId: s.questionId,
      placeId: parsed.placeId,
      stage: parsed.stage,
      tier: "review",
      state: s,
    });
  }
  const seed = hashSeed(`${input.seedKey}:${today}:geo`);
  // One card per place a session: the more overdue of its two.
  const shuffled = seededShuffle(
    reviews.sort((a, b) => (a.state?.dueDate ?? "").localeCompare(b.state?.dueDate ?? "")),
    seed,
  );
  const picked: GeoSessionItem[] = [];
  for (const r of shuffled) {
    if (seen.has(r.placeId)) continue;
    seen.add(r.placeId);
    picked.push(r);
  }
  const limited = picked.slice(0, input.limit ?? DEFAULT_LIMIT);

  // 2. Places in progress: their next stage.
  const stages: GeoSessionItem[] = [];
  for (const place of inProgress(catalog, byCard)) {
    const stage = currentStage(byCard, place.id);
    if (stage && !seen.has(place.id)) stages.push(item(place.id, stage, "stage"));
  }

  // 3. New places.
  // New places come a whole group at a time — all continents, all
  // countries of a continent, all cities of a subregion. The learner picks
  // the group (`group`); without a pick, the breadth-first suggestion, and
  // only once nothing is left halfway up its stages.
  const groups = openGroups(catalog, byCard, settings);
  const chosen =
    input.group === null
      ? undefined
      : input.group === undefined
        ? stages.length > 0
          ? undefined
          : groups[0]
        : groups.find((g) => g.id === input.group);
  const fresh = (chosen?.places ?? [])
    .filter((p) => !seen.has(p.id))
    .map((p) => item(p.id, 1, "new"));

  return [...limited, ...stages, ...fresh];
}

/** The group a place is introduced with: the continents, a continent's countries, a subregion's cities. */
export function groupOf(catalog: GeoCatalog, place: Place): string {
  if (place.kind === "continent") return "continents";
  if (place.kind === "country") return `countries:${place.continent}`;
  const country = catalog.byId.get(place.country);
  return country?.kind === "country" ? `cities:${country.subregion}` : `cities:${place.country}`;
}

export interface OpenGroup {
  id: string;
  kind: "continents" | "countries" | "cities";
  continent: ContinentId | null;
  subregion: string | null;
  places: Place[];
}

/**
 * Every group with places open to start, breadth first: the continents,
 * then every continent's countries, then cities region by region — the
 * order the ladder suggests, not one it forces.
 */
export function openGroups(
  catalog: GeoCatalog,
  states: ReadonlyMap<string, SrsState>,
  settings: LadderSettings,
): OpenGroup[] {
  const byId = new Map<string, OpenGroup>();
  for (const place of newPlaceFrontier(catalog, states, settings)) {
    const id = groupOf(catalog, place);
    let g = byId.get(id);
    if (!g) {
      const country =
        place.kind === "country"
          ? place
          : place.kind === "city"
            ? catalog.byId.get(place.country)
            : undefined;
      g = {
        id,
        kind:
          place.kind === "continent"
            ? "continents"
            : place.kind === "country"
              ? "countries"
              : "cities",
        continent: country?.kind === "country" ? country.continent : null,
        subregion: place.kind === "city" && country?.kind === "country" ? country.subregion : null,
        places: [],
      };
      byId.set(id, g);
    }
    g.places.push(place);
  }
  const rank = { continents: 0, countries: 1, cities: 2 } as const;
  const continentIdx = (c: ContinentId | null) =>
    c ? catalog.continents.findIndex((x) => x.code === c) : -1;
  const subOrder = (s: string | null) => (s ? (catalog.subregionById.get(s)?.order ?? 99) : -1);
  return [...byId.values()].sort(
    (a, b) =>
      rank[a.kind] - rank[b.kind] ||
      continentIdx(a.continent) - continentIdx(b.continent) ||
      subOrder(a.subregion) - subOrder(b.subregion),
  );
}
