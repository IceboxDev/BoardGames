import type { Geom, Lod } from "./lod";

// The fast path of the globe: an orthographic projection written out as a
// rotation of precomputed unit vectors (the same maths as d3's
// `geoOrthographic().rotate([λ, φ])`, checked in render.test.ts), and the
// tracing of polygons and borders at the level of detail the zoom resolves.
// Points on the far side are pulled onto the rim, which keeps a polygon
// that wraps over the horizon filled correctly without a clipping pass.

export interface View {
  cx: number;
  cy: number;
  /** Globe radius, px. */
  r: number;
  cL: number;
  sL: number;
  cP: number;
  sP: number;
  /** Unit vector of the point in the middle of the view. */
  dx: number;
  dy: number;
  dz: number;
  /** Angular radius of what is on screen, radians. */
  cap: number;
  /** Highest point level drawn. */
  maxLevel: number;
}

/** A point whose removal changes less than this many px² is left out. */
const TOLERANCE_PX = 0.6;
/** Polygons smaller than this on screen are skipped (sub-pixel specks). */
const MIN_POLY_PX = 0.35;

export function makeView(w: number, h: number, r: number, lambdaDeg: number, phiDeg: number): View {
  const L = (lambdaDeg * Math.PI) / 180;
  const P = (phiDeg * Math.PI) / 180;
  // The view centre is (−λ, −φ).
  const lon = -L;
  const lat = -P;
  const halfDiag = Math.hypot(w, h) / 2;
  return {
    cx: w / 2,
    cy: h / 2,
    r,
    cL: Math.cos(L),
    sL: Math.sin(L),
    cP: Math.cos(P),
    sP: Math.sin(P),
    dx: Math.cos(lat) * Math.cos(lon),
    dy: Math.cos(lat) * Math.sin(lon),
    dz: Math.sin(lat),
    cap: halfDiag >= r ? Math.PI / 2 : Math.asin(halfDiag / r) + 0.02,
    maxLevel: Math.max(0, Math.min(63, Math.floor(2 * Math.log2(r / TOLERANCE_PX)))),
  };
}

/** Screen position of a unit vector; `front` false when it is on the far side. */
export function project(v: View, X: number, Y: number, Z: number, out: Float64Array): boolean {
  const x1 = X * v.cL - Y * v.sL;
  const y1 = X * v.sL + Y * v.cL;
  const xp = x1 * v.cP - Z * v.sP;
  const zp = Z * v.cP + x1 * v.sP;
  if (xp > 0) {
    out[0] = v.cx + v.r * y1;
    out[1] = v.cy - v.r * zp;
    return true;
  }
  // Behind the globe: onto the rim, in the same direction.
  const len = Math.hypot(y1, zp) || 1;
  out[0] = v.cx + (v.r * y1) / len;
  out[1] = v.cy - (v.r * zp) / len;
  return false;
}

const pt = new Float64Array(2);

function polyVisible(v: View, cx: number, cy: number, cz: number, radius: number): boolean {
  if (radius * v.r < MIN_POLY_PX) return false;
  const d = cx * v.dx + cy * v.dy + cz * v.dz;
  const angle = Math.acos(Math.max(-1, Math.min(1, d)));
  return angle - radius < v.cap;
}

/** Add a feature's visible polygons to the current path. */
export function traceGeom(ctx: CanvasRenderingContext2D, lod: Lod, geom: Geom, v: View): void {
  const { arcStart, xyz, level } = lod;
  const max = v.maxLevel;
  for (const poly of geom.polys) {
    if (!polyVisible(v, poly.cx, poly.cy, poly.cz, poly.radius)) continue;
    for (const ring of poly.rings) {
      let started = false;
      for (let k = 0; k < ring.length; k++) {
        const ref = ring[k];
        const rev = ref < 0;
        const a = rev ? ~ref : ref;
        const s = arcStart[a];
        const e = arcStart[a + 1] - 1;
        const n = e - s;
        for (let j = k === 0 ? 0 : 1; j <= n; j++) {
          const i = rev ? e - j : s + j;
          if (level[i] > max) continue;
          const i3 = i * 3;
          project(v, xyz[i3], xyz[i3 + 1], xyz[i3 + 2], pt);
          if (started) ctx.lineTo(pt[0], pt[1]);
          else {
            ctx.moveTo(pt[0], pt[1]);
            started = true;
          }
        }
      }
      if (started) ctx.closePath();
    }
  }
}

/** Add every land border on the near side to the current path. */
export function traceBorders(ctx: CanvasRenderingContext2D, lod: Lod, v: View): void {
  const { arcStart, xyz, level, borderArcs } = lod;
  const max = v.maxLevel;
  for (let b = 0; b < borderArcs.length; b++) {
    const a = borderArcs[b];
    let pen = false;
    for (let i = arcStart[a]; i < arcStart[a + 1]; i++) {
      if (level[i] > max) continue;
      const i3 = i * 3;
      const front = project(v, xyz[i3], xyz[i3 + 1], xyz[i3 + 2], pt);
      if (!front) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(pt[0], pt[1]);
      else {
        ctx.moveTo(pt[0], pt[1]);
        pen = true;
      }
    }
  }
}
