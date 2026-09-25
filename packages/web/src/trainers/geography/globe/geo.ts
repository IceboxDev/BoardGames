import { geoArea, geoBounds, geoDistance } from "d3-geo";
import type { Feature, Polygon } from "geojson";
import { contains, type World } from "./world";

// Small spherical helpers for the globe: what lies under a point, how far a
// point is from a place, and meridian bands for clipping a split country.

export type LonLat = [number, number];

export const EARTH_KM = 6371;

export function distanceKm(a: LonLat, b: LonLat): number {
  return geoDistance(a, b) * EARTH_KM;
}

/** The feature (country or territory) under a point, if any. */
export function featureAt(world: World, at: LonLat): string | null {
  for (const id of world.ids()) if (contains(world, id, at)) return id;
  return null;
}

/** Is the point inside the feature? */
export function insideFeature(world: World, id: string, at: LonLat): boolean {
  return contains(world, id, at);
}

/**
 * Great-circle km from a point to a feature's outline, inside or out. Each
 * edge is measured in a local flat frame around the point — exact enough at
 * the tens-of-km scale the grading cares about.
 */
export function distanceToOutlineKm(world: World, id: string, at: LonLat): number {
  const shape = world.shape(id);
  if (!shape) return Number.POSITIVE_INFINITY;
  const [plon, plat] = at;
  const kx = Math.cos((plat * Math.PI) / 180);
  let best = Number.POSITIVE_INFINITY;
  for (const poly of shape.geometry.coordinates) {
    for (const ring of poly) {
      let px = 0;
      let py = 0;
      for (let i = 0; i < ring.length; i++) {
        let dl = ring[i][0] - plon;
        if (dl > 180) dl -= 360;
        if (dl < -180) dl += 360;
        const bx = dl * kx;
        const by = ring[i][1] - plat;
        if (i > 0) {
          const dx = bx - px;
          const dy = by - py;
          const len2 = dx * dx + dy * dy;
          const t = len2 > 0 ? Math.max(0, Math.min(1, -(px * dx + py * dy) / len2)) : 0;
          const d = Math.hypot(px + t * dx, py + t * dy);
          if (d < best) best = d;
        }
        px = bx;
        py = by;
      }
    }
  }
  return (best * Math.PI * EARTH_KM) / 180;
}

/** Great-circle km from a point to a feature (0 inside). */
export function distanceToFeatureKm(world: World, id: string, at: LonLat): number {
  if (!world.shape(id)) return Number.POSITIVE_INFINITY;
  if (contains(world, id, at)) return 0;
  return distanceToOutlineKm(world, id, at);
}

/**
 * A random point inside a feature, at least `marginKm` from its outline
 * (else the deepest point found): the stage-4 question "which place is
 * this?" should never be a coin flip on a border.
 */
export function interiorPoint(
  world: World,
  id: string,
  marginKm: number,
  rand: () => number = Math.random,
): LonLat | null {
  const shape = world.shape(id);
  if (!shape) return null;
  const [[w, s], [e, n]] = geoBounds(shape);
  const span = e >= w ? e - w : e + 360 - w;
  const sinS = Math.sin((s * Math.PI) / 180);
  const sinN = Math.sin((n * Math.PI) / 180);
  let best: { at: LonLat; d: number } | null = null;
  for (let i = 0; i < 400; i++) {
    let lon = w + rand() * span;
    if (lon > 180) lon -= 360;
    // Uniform over area, not over latitude.
    const lat = (Math.asin(sinS + rand() * (sinN - sinS)) * 180) / Math.PI;
    const at: LonLat = [lon, lat];
    if (!contains(world, id, at)) continue;
    const d = distanceToOutlineKm(world, id, at);
    if (d >= marginKm) return at;
    if (!best || d > best.d) best = { at, d };
  }
  return best?.at ?? null;
}

/** The half of the globe west or east of a meridian, as a clip polygon. */
export function meridianBand(lon: number, side: "west" | "east"): Feature<Polygon> {
  const from = side === "west" ? lon - 179.9 : lon;
  const to = side === "west" ? lon : lon + 179.9;
  const ring: LonLat[] = [];
  for (let lat = -89.9; lat <= 89.9; lat += 5) ring.push([from, lat]);
  for (let l = from; l <= to; l += 5) ring.push([l, 89.9]);
  for (let lat = 89.9; lat >= -89.9; lat -= 5) ring.push([to, lat]);
  for (let l = to; l >= from; l -= 5) ring.push([l, -89.9]);
  ring.push(ring[0]);
  const band: Feature<Polygon> = {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
  // d3 wants the interior on the right: reverse when this winding took the rest of the sphere.
  if (geoArea(band) > 2 * Math.PI) band.geometry.coordinates[0].reverse();
  return band;
}
