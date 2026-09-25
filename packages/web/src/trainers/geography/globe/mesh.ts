import earcut from "earcut";
import type { Lod } from "./lod";

// The land as a GPU triangle mesh, built once per geometry cut (in a worker):
// every polygon is laid flat on an azimuthal projection around its own
// centre (no seams at the antimeridian or the poles), triangulated with
// earcut, and any triangle wider than MAX_EDGE is split in four with the new
// corners pushed back onto the sphere — so the flat triangles hug the
// globe even at the closest zoom. Vertices are unit vectors; each carries
// its feature's index, which picks its colour on the GPU.

export interface Mesh {
  /** x y z per vertex (unit vectors). */
  positions: Float32Array;
  /** Feature index per vertex. */
  feature: Float32Array;
  indices: Uint32Array;
}

/**
 * Longest triangle edge, radians. A chord of angle θ sags ≈ Rθ²/8 below the
 * sphere: 4° (≈ 12 km) is under a pixel for the whole-earth views the light
 * cut serves, 1.2° (≈ 1 km) for the closest zoom of the full one.
 */
export const EDGE_LITE = (4 * Math.PI) / 180;
export const EDGE_FULL = (1.2 * Math.PI) / 180;
/** Recursion guard only: halving any edge 16 times takes it far below MAX_EDGE. */
const MAX_SPLITS = 16;

export function triangulate(lod: Lod, maxEdge = EDGE_FULL): Mesh {
  const MAX_EDGE = maxEdge;
  const pos: number[] = [];
  const feat: number[] = [];
  const idx: number[] = [];
  const { arcStart, xyz } = lod;

  const addVertex = (x: number, y: number, z: number, f: number): number => {
    pos.push(x, y, z);
    feat.push(f);
    return feat.length - 1;
  };

  lod.geoms.forEach((geom, f) => {
    for (const poly of geom.polys) {
      // Ring points (unit vectors), closing duplicate dropped.
      const rings: number[][] = [];
      for (const ring of poly.rings) {
        const pts: number[] = [];
        ring.forEach((ref, k) => {
          const rev = ref < 0;
          const a = rev ? ~ref : ref;
          const s = arcStart[a];
          const e = arcStart[a + 1] - 1;
          for (let j = k === 0 ? 0 : 1; j <= e - s; j++) pts.push(rev ? e - j : s + j);
        });
        if (pts.length > 1 && pts[0] === pts[pts.length - 1]) pts.pop();
        if (pts.length >= 3) rings.push(pts);
      }
      if (rings.length === 0) continue;

      // An orthonormal frame at the polygon's centre, and the azimuthal
      // equidistant projection onto it.
      const c = [poly.cx, poly.cy, poly.cz];
      const helper = Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const u = normalize(cross(helper, c));
      const v = cross(c, u);
      const flat: number[] = [];
      const holes: number[] = [];
      const base = feat.length;
      let count = 0;
      rings.forEach((pts, r) => {
        if (r > 0) holes.push(count);
        for (const i of pts) {
          const px = xyz[i * 3];
          const py = xyz[i * 3 + 1];
          const pz = xyz[i * 3 + 2];
          const d = px * c[0] + py * c[1] + pz * c[2];
          const theta = Math.acos(Math.max(-1, Math.min(1, d)));
          const tu = px * u[0] + py * u[1] + pz * u[2];
          const tv = px * v[0] + py * v[1] + pz * v[2];
          const len = Math.hypot(tu, tv);
          flat.push(len > 1e-12 ? (theta * tu) / len : 0, len > 1e-12 ? (theta * tv) / len : 0);
          addVertex(px, py, pz, f);
          count++;
        }
      });
      const tris = earcut(flat, holes.length ? holes : undefined, 2);
      const mid = new Map<number, number>();
      const midpoint = (a: number, b: number): number => {
        const key = a < b ? a * 4194304 + b : b * 4194304 + a;
        const hit = mid.get(key);
        if (hit !== undefined) return hit;
        const x = pos[a * 3] + pos[b * 3];
        const y = pos[a * 3 + 1] + pos[b * 3 + 1];
        const z = pos[a * 3 + 2] + pos[b * 3 + 2];
        const l = Math.hypot(x, y, z) || 1;
        const m = addVertex(x / l, y / l, z / l, f);
        mid.set(key, m);
        return m;
      };
      const angle = (a: number, b: number) =>
        Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              pos[a * 3] * pos[b * 3] +
                pos[a * 3 + 1] * pos[b * 3 + 1] +
                pos[a * 3 + 2] * pos[b * 3 + 2],
            ),
          ),
        );
      // Split by EDGE, not by triangle: an edge is halved when it is long,
      // whatever triangle it belongs to — so the two triangles sharing it
      // (inside a country, or across a border) always agree, and no
      // T-junction leaves a hairline crack showing the sea through the land.
      const emit = (a: number, b: number, c: number, depth: number) => {
        const lab = depth < MAX_SPLITS && angle(a, b) > MAX_EDGE;
        const lbc = depth < MAX_SPLITS && angle(b, c) > MAX_EDGE;
        const lca = depth < MAX_SPLITS && angle(c, a) > MAX_EDGE;
        const d = depth + 1;
        if (lab && lbc && lca) {
          const ab = midpoint(a, b);
          const bc = midpoint(b, c);
          const ca = midpoint(c, a);
          emit(a, ab, ca, d);
          emit(ab, b, bc, d);
          emit(ca, bc, c, d);
          emit(ab, bc, ca, d);
        } else if (lab && lbc) {
          const ab = midpoint(a, b);
          const bc = midpoint(b, c);
          emit(ab, b, bc, d);
          emit(a, ab, bc, d);
          emit(a, bc, c, d);
        } else if (lbc && lca) {
          const bc = midpoint(b, c);
          const ca = midpoint(c, a);
          emit(ca, bc, c, d);
          emit(a, b, bc, d);
          emit(a, bc, ca, d);
        } else if (lca && lab) {
          const ca = midpoint(c, a);
          const ab = midpoint(a, b);
          emit(a, ab, ca, d);
          emit(ab, b, c, d);
          emit(ab, c, ca, d);
        } else if (lab) {
          const ab = midpoint(a, b);
          emit(a, ab, c, d);
          emit(ab, b, c, d);
        } else if (lbc) {
          const bc = midpoint(b, c);
          emit(a, b, bc, d);
          emit(a, bc, c, d);
        } else if (lca) {
          const ca = midpoint(c, a);
          emit(a, b, ca, d);
          emit(ca, b, c, d);
        } else {
          idx.push(a, b, c);
        }
      };
      for (let t = 0; t < tris.length; t += 3) {
        emit(base + tris[t], base + tris[t + 1], base + tris[t + 2], 0);
      }
    }
  });
  return {
    positions: Float32Array.from(pos),
    feature: Float32Array.from(feat),
    indices: Uint32Array.from(idx),
  };
}

function cross(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(a: number[]): number[] {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
