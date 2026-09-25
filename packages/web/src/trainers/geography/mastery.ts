import { cardId, type GeoCatalog } from "@boardgames/core/trainers/geography/catalog";
import type { ContinentId } from "@boardgames/core/trainers/geography/content-types";
import { placeDone, placeStarted, stageReached } from "@boardgames/core/trainers/geography/ladder";
import { SRS, type SrsState } from "@boardgames/core/trainers/srs";
import type { GlobeFill, GlobeMarker } from "./globe/Globe";

// How well each place is known, for the hub's "your world" globe, the
// per-continent level track and the "region complete" moments.

/** 0 unseen · 1 climbing its stages · 2 all four cleared · 3 mature (its reviews ≥ 21 days apart). */
export type Level = 0 | 1 | 2 | 3;

type States = ReadonlyMap<string, SrsState>;

export function placeLevel(states: States, placeId: string): Level {
  if (!placeStarted(states, placeId)) return 0;
  if (!placeDone(states, placeId)) return 1;
  const mature = ([3, 4] as const).every(
    (s) => (states.get(cardId(placeId, s))?.intervalDays ?? 0) >= SRS.MATURE_DAYS,
  );
  return mature ? 3 : 2;
}

/** Stages cleared so far, 0–4. */
export function stagesOf(states: States, placeId: string): number {
  return stageReached(states, placeId);
}

const ALPHA: Record<Level, number> = { 0: 0, 1: 0.22, 2: 0.5, 3: 0.9 };

export function masteryFills(catalog: GeoCatalog, states: States): GlobeFill[] {
  const out: GlobeFill[] = [];
  for (const c of catalog.countries) {
    const level = placeLevel(states, c.id);
    if (level > 0) out.push({ feature: c.feature, tone: "accent", alpha: ALPHA[level] });
  }
  return out;
}

export function masteryMarkers(catalog: GeoCatalog, states: States): GlobeMarker[] {
  const out: GlobeMarker[] = [];
  for (const c of catalog.cities) {
    const level = placeLevel(states, c.id);
    if (level > 0)
      out.push({ at: c.at, tone: level >= 2 ? "ok" : "accent", size: level === 3 ? 3 : 2 });
  }
  return out;
}

export interface Tally {
  total: number;
  seen: number;
  known: number;
  mature: number;
}

export interface ContinentProgress {
  code: ContinentId;
  /** Its countries are open (the continent has cleared all four stages). */
  unlocked: boolean;
  continent: Level;
  /** Stages the continent itself has cleared. */
  stages: number;
  countries: Tally;
  cities: Tally;
}

function tally(levels: Level[]): Tally {
  return {
    total: levels.length,
    seen: levels.filter((l) => l > 0).length,
    known: levels.filter((l) => l >= 2).length,
    mature: levels.filter((l) => l === 3).length,
  };
}

export function continentProgress(catalog: GeoCatalog, states: States): ContinentProgress[] {
  return catalog.continents.map((ct) => {
    const countries = catalog.countries.filter((c) => c.continent === ct.code);
    const cities = countries.flatMap((c) => catalog.citiesByCountry.get(c.id) ?? []);
    return {
      code: ct.code,
      unlocked: placeDone(states, ct.id),
      continent: placeLevel(states, ct.id),
      stages: stageReached(states, ct.id),
      countries: tally(countries.map((c) => placeLevel(states, c.id))),
      cities: tally(cities.map((c) => placeLevel(states, c.id))),
    };
  });
}

/** Subregions whose every country has cleared all four stages. */
export function completeSubregions(catalog: GeoCatalog, states: States): Set<string> {
  const out = new Set<string>();
  for (const [sub, countries] of catalog.countriesBySubregion) {
    if (countries.length > 0 && countries.every((c) => placeDone(states, c.id))) out.add(sub);
  }
  return out;
}
