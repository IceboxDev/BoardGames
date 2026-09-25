import type { SrsState } from "../srs.ts";
import { cardId, continentOf, type GeoCatalog, STAGES, type Stage } from "./catalog.ts";
import type { ContinentId, Place } from "./content-types.ts";

// The ladder: every place climbs four stages (catalog.ts STAGES) and a
// place that has cleared all four opens the next depth:
//   - the seven continents are open from the start;
//   - a continent cleared → its countries open;
//   - every country of a subregion cleared → that subregion's cities open.
// A stage is cleared by answering it correctly once (the card then carries
// an interval of a day or more). Missing it again the next day sends the
// place back to that stage; a lapse once the card has graduated does not.

export interface LadderSettings {
  /** Introduce new countries and cities only on this continent. */
  focus: ContinentId | null;
}

type States = ReadonlyMap<string, SrsState>;

/** Has this stage card been answered correctly (now or before)? */
export function cleared(s: Pick<SrsState, "state" | "intervalDays"> | undefined): boolean {
  return (
    s !== undefined && (s.state === "review" || s.state === "relearning" || s.intervalDays >= 1)
  );
}

/** Highest stage cleared in a row from stage 1 (0 = none). */
export function stageReached(states: States, placeId: string): number {
  let reached = 0;
  for (const stage of STAGES) {
    if (!cleared(states.get(cardId(placeId, stage)))) break;
    reached = stage;
  }
  return reached;
}

/** The stage a place is on: the first not cleared (null once all four are). */
export function currentStage(states: States, placeId: string): Stage | null {
  const reached = stageReached(states, placeId);
  return reached >= 4 ? null : ((reached + 1) as Stage);
}

/** All four stages cleared. */
export function placeDone(states: States, placeId: string): boolean {
  return stageReached(states, placeId) >= 4;
}

/** Has the place been started (its first stage answered at all)? */
export function placeStarted(states: States, placeId: string): boolean {
  return states.has(cardId(placeId, 1));
}

/** Is the place open to be learned? */
export function unlocked(catalog: GeoCatalog, states: States, place: Place): boolean {
  if (place.kind === "continent") return true;
  if (place.kind === "country") {
    const continent = catalog.continentByCode.get(place.continent);
    return !!continent && placeDone(states, continent.id);
  }
  const country = catalog.byId.get(place.country);
  if (!country || country.kind !== "country") return false;
  const siblings = catalog.countriesBySubregion.get(country.subregion) ?? [];
  return siblings.length > 0 && siblings.every((c) => placeDone(states, c.id));
}

/** A sort key for the introduction order (compared element-wise). */
function orderKey(catalog: GeoCatalog, place: Place): number[] {
  const continentIdx = (code: ContinentId) => catalog.continents.findIndex((c) => c.code === code);
  if (place.kind === "continent") return [0, continentIdx(place.code)];
  const country = place.kind === "country" ? place : catalog.byId.get(place.country);
  if (!country || country.kind !== "country") return [9];
  const sub = catalog.subregionById.get(country.subregion)?.order ?? 99;
  const base = [continentIdx(country.continent), sub];
  if (place.kind === "country") return [1, ...base, 0, place.order];
  // A subregion's cities right after its countries: capitals, then the rest.
  return [1, ...base, 1, place.order, country.order];
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

/** Open places not started yet, in introduction order. */
export function newPlaceFrontier(
  catalog: GeoCatalog,
  states: States,
  settings: LadderSettings,
): Place[] {
  const out: Place[] = [];
  for (const place of catalog.places) {
    if (placeStarted(states, place.id)) continue;
    if (
      place.kind !== "continent" &&
      settings.focus &&
      continentOf(catalog, place) !== settings.focus
    ) {
      continue;
    }
    if (unlocked(catalog, states, place)) out.push(place);
  }
  const keys = new Map(out.map((p) => [p.id, orderKey(catalog, p)]));
  return out.sort(
    (a, b) => compareKeys(keys.get(a.id) ?? [], keys.get(b.id) ?? []) || a.id.localeCompare(b.id),
  );
}

/** Places started but not through all four stages, in introduction order. */
export function inProgress(catalog: GeoCatalog, states: States): Place[] {
  const out = catalog.places.filter((p) => placeStarted(states, p.id) && !placeDone(states, p.id));
  const keys = new Map(out.map((p) => [p.id, orderKey(catalog, p)]));
  return out.sort((a, b) => compareKeys(keys.get(a.id) ?? [], keys.get(b.id) ?? []));
}

/** What clearing `place` opens: its countries, or its subregion's cities. */
export function unlockedBy(catalog: GeoCatalog, states: States, place: Place): Place[] {
  if (place.kind === "continent") {
    return catalog.countries.filter((c) => c.continent === place.code);
  }
  if (place.kind !== "country") return [];
  const siblings = catalog.countriesBySubregion.get(place.subregion) ?? [];
  if (!siblings.every((c) => c.id === place.id || placeDone(states, c.id))) return [];
  return siblings.flatMap((c) => catalog.citiesByCountry.get(c.id) ?? []);
}
