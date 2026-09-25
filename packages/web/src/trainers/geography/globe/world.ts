import { geoContains } from "d3-geo";
import type { Feature, MultiPolygon } from "geojson";
import fullUrl from "../../../../../core/src/trainers/geography/content/world.lod.bin?url";
import liteUrl from "../../../../../core/src/trainers/geography/content/world-lite.lod.bin?url";
import { decodeLod, type Geom, geomToGeoJson, type Lod } from "./lod";
import { EDGE_FULL, EDGE_LITE, type Mesh, triangulate } from "./mesh";

// The globe's geometry: Natural Earth 10m as one multi-resolution file (every
// point knows at which zoom it starts to matter). A light cut (≈ 250 KB,
// what a whole-earth view resolves) arrives first; the full detail
// (≈ 1 MB) streams in right after, so zooming in never waits for — or pops
// in — anything.

export interface World {
  /** The best geometry loaded so far. */
  lod: () => Lod;
  /** The land for the GPU: the light cut's mesh, and the full one once built. */
  mesh: (which: "lite" | "full") => Mesh | undefined;
  /** True once the full detail is in. */
  complete: () => boolean;
  geom: (id: string) => Geom | undefined;
  /** The feature as GeoJSON (every point of the best geometry), for exact tests. */
  shape: (id: string) => Feature<MultiPolygon> | undefined;
  /** Cheap pre-test: could the point be inside the feature? */
  maybeInside: (id: string, lonLat: [number, number]) => boolean;
  ids: () => readonly string[];
  /** Called when better geometry arrives. */
  subscribe: (fn: () => void) => () => void;
}

type Cut = { lod: Lod; mesh: Mesh };

/** Fetch, decode and triangulate a cut — in a worker, or here if workers are unavailable. */
function loadCut(url: string, lite: boolean): Promise<Cut> {
  if (typeof Worker !== "undefined") {
    return new Promise<Cut>((resolve, reject) => {
      const worker = new Worker(new URL("./geometry.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (
        e: MessageEvent<{ ok: boolean; lod?: Lod; mesh?: Mesh; error?: string }>,
      ) => {
        worker.terminate();
        if (e.data.ok && e.data.lod && e.data.mesh) resolve({ lod: e.data.lod, mesh: e.data.mesh });
        else reject(new Error(e.data.error ?? "globe worker failed"));
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(new Error(e.message));
      };
      worker.postMessage({ url, lite });
    });
  }
  return fetch(url)
    .then((res) => res.arrayBuffer())
    .then((buf) => {
      const lod = decodeLod(buf);
      return { lod, mesh: triangulate(lod, lite ? EDGE_LITE : EDGE_FULL) };
    });
}

/** A world over one decoded geometry; `upgrade` swaps in better geometry later. */
export function worldOf(
  first: Lod,
  liteMesh?: Mesh,
): World & { upgrade: (lod: Lod, mesh?: Mesh) => void } {
  let lod = first;
  let fullMesh: Mesh | undefined;
  let full = false;
  let index = new Map(lod.geoms.map((g) => [g.id, g]));
  let shapes = new Map<string, Feature<MultiPolygon>>();
  const listeners = new Set<() => void>();
  return {
    lod: () => lod,
    mesh: (which) => (which === "lite" ? liteMesh : fullMesh),
    complete: () => full,
    geom: (id) => index.get(id),
    shape: (id) => {
      const hit = shapes.get(id);
      if (hit) return hit;
      const g = index.get(id);
      if (!g) return undefined;
      const f: Feature<MultiPolygon> = {
        type: "Feature",
        properties: {},
        geometry: { type: "MultiPolygon", coordinates: geomToGeoJson(lod, g) },
      };
      shapes.set(id, f);
      return f;
    },
    maybeInside: (id, [lonDeg, latDeg]) => {
      const g = index.get(id);
      if (!g) return false;
      const lo = (lonDeg * Math.PI) / 180;
      const la = (latDeg * Math.PI) / 180;
      const x = Math.cos(la) * Math.cos(lo);
      const y = Math.cos(la) * Math.sin(lo);
      const z = Math.sin(la);
      return g.polys.some((p) => p.cx * x + p.cy * y + p.cz * z >= Math.cos(p.radius) - 1e-9);
    },
    ids: () => lod.ids,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    upgrade: (better, mesh) => {
      lod = better;
      fullMesh = mesh;
      full = true;
      index = new Map(lod.geoms.map((g) => [g.id, g]));
      shapes = new Map();
      for (const fn of listeners) fn();
    },
  };
}

let pending: Promise<World> | null = null;

export function loadWorld(): Promise<World> {
  pending ??= loadCut(liteUrl, true).then((lite) => {
    const world = worldOf(lite.lod, lite.mesh);
    void loadCut(fullUrl, false)
      .then((full) => world.upgrade(full.lod, full.mesh))
      .catch(() => {
        // The light geometry still works; only extreme close-ups are coarser.
      });
    return world;
  });
  return pending;
}

/** Exact point-in-feature on the best geometry. */
export function contains(world: World, id: string, at: [number, number]): boolean {
  if (!world.maybeInside(id, at)) return false;
  const s = world.shape(id);
  return !!s && geoContains(s, at);
}
