import { focusOf, type GeoCatalog } from "@boardgames/core/trainers/geography/catalog";
import type { Place } from "@boardgames/core/trainers/geography/content-types";
import { interiorPoint, type LonLat } from "./globe/geo";
import type { World } from "./globe/world";

// Where a stage-4 question points: somewhere inside the place, never close
// to its edge. A continent picks one of its countries that lies wholly in
// it (weighted by area — Brazil more often than Belize); a city is its own
// dot.

export function stageFourPoint(
  world: World,
  catalog: GeoCatalog,
  place: Place,
  rand: () => number = Math.random,
): LonLat {
  if (place.kind === "city") return place.at;
  if (place.kind === "country") {
    if (place.tiny) return place.focus;
    const r = Math.sqrt(place.areaKm2 / Math.PI);
    const margin = Math.min(150, Math.max(10, r * 0.25));
    return interiorPoint(world, place.feature, margin, rand) ?? place.focus;
  }
  const inside = catalog.countries.filter(
    (c) => c.continent === place.code && !c.split && c.alsoContinents.length === 0 && !c.tiny,
  );
  if (inside.length === 0) {
    // Antarctica: a point on its ice, well away from the coast.
    const t = [...catalog.territoryByFeature.values()].find((x) => x.continent === place.code);
    return (t && interiorPoint(world, t.feature, 300, rand)) ?? focusOf(place);
  }
  const total = inside.reduce((sum, c) => sum + c.areaKm2, 0);
  const pick = rand() * total;
  let acc = 0;
  const country =
    inside.find((c) => {
      acc += c.areaKm2;
      return acc >= pick;
    }) ?? inside[0];
  const r = Math.sqrt(country.areaKm2 / Math.PI);
  return (
    interiorPoint(world, country.feature, Math.min(200, Math.max(10, r * 0.2)), rand) ??
    country.focus
  );
}
