// Decoding the globe's multi-resolution binary (written by
// scripts/geography/lod.ts) into flat typed arrays the renderer can walk
// every frame without allocating: each point's unit vector (so projecting
// is a handful of multiplications, no trigonometry), its importance level,
// and for every polygon a bounding cap for culling.

export interface Poly {
  /** Rings as arc references (~i = arc i reversed); the first is the outline. */
  rings: Int32Array[];
  /** Unit vector of the cap centre. */
  cx: number;
  cy: number;
  cz: number;
  /** Angular radius of the cap, radians. */
  radius: number;
}

export interface Geom {
  id: string;
  polys: Poly[];
}

export interface Lod {
  ids: string[];
  /** Arc i spans points arcStart[i] … arcStart[i + 1] − 1. */
  arcStart: Uint32Array;
  lon: Float32Array;
  lat: Float32Array;
  /** Unit vectors, x y z per point. */
  xyz: Float32Array;
  level: Uint8Array;
  geoms: Geom[];
  /** Arcs shared by two different features: the land borders. */
  borderArcs: Uint32Array;
}

const UNIT = 1e-3;
const RAD = Math.PI / 180;

class Reader {
  private i = 0;
  constructor(private readonly b: Uint8Array) {}
  u8(): number {
    return this.b[this.i++];
  }
  uvar(): number {
    let x = 0;
    let shift = 0;
    for (;;) {
      const byte = this.b[this.i++];
      x += (byte & 0x7f) * 2 ** shift;
      if (byte < 0x80) return x;
      shift += 7;
    }
  }
  svar(): number {
    const u = this.uvar();
    return u % 2 === 0 ? u / 2 : -(u + 1) / 2;
  }
  text(): string {
    const n = this.uvar();
    const s = new TextDecoder().decode(this.b.subarray(this.i, this.i + n));
    this.i += n;
    return s;
  }
}

export function decodeLod(buffer: ArrayBuffer): Lod {
  const r = new Reader(new Uint8Array(buffer));
  const magic = String.fromCharCode(r.u8(), r.u8(), r.u8(), r.u8());
  if (magic !== "GLOD" || r.u8() !== 1) throw new Error("not a globe LOD file");
  const nIds = r.uvar();
  const ids: string[] = [];
  for (let i = 0; i < nIds; i++) ids.push(r.text());

  const nArcs = r.uvar();
  const arcStart = new Uint32Array(nArcs + 1);
  for (let a = 0; a < nArcs; a++) arcStart[a + 1] = arcStart[a] + r.uvar();
  const n = arcStart[nArcs];
  const lon = new Float32Array(n);
  const lat = new Float32Array(n);
  for (const out of [lon, lat]) {
    for (let a = 0; a < nArcs; a++) {
      let v = 0;
      for (let i = arcStart[a]; i < arcStart[a + 1]; i++) {
        v += r.svar();
        out[i] = v * UNIT;
      }
    }
  }
  const level = new Uint8Array(n);
  for (let i = 0; i < n; i++) level[i] = r.uvar();
  const xyz = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const l = lon[i] * RAD;
    const p = lat[i] * RAD;
    const c = Math.cos(p);
    xyz[i * 3] = c * Math.cos(l);
    xyz[i * 3 + 1] = c * Math.sin(l);
    xyz[i * 3 + 2] = Math.sin(p);
  }

  const uses = new Uint16Array(nArcs);
  const lastUser = new Int32Array(nArcs).fill(-1);
  const geoms: Geom[] = [];
  for (let g = 0; g < nIds; g++) {
    const polys: Poly[] = [];
    const nPolys = r.uvar();
    for (let p = 0; p < nPolys; p++) {
      const rings: Int32Array[] = [];
      const nRings = r.uvar();
      for (let k = 0; k < nRings; k++) {
        const nRefs = r.uvar();
        const ring = new Int32Array(nRefs);
        for (let j = 0; j < nRefs; j++) {
          const ref = r.svar();
          ring[j] = ref;
          const a = ref < 0 ? ~ref : ref;
          if (lastUser[a] !== g) {
            lastUser[a] = g;
            uses[a]++;
          }
        }
        rings.push(ring);
      }
      polys.push({ rings, ...capOf(rings[0], arcStart, xyz) });
    }
    geoms.push({ id: ids[g], polys });
  }
  const borders: number[] = [];
  for (let a = 0; a < nArcs; a++) if (uses[a] >= 2) borders.push(a);
  return { ids, arcStart, lon, lat, xyz, level, geoms, borderArcs: Uint32Array.from(borders) };
}

function capOf(ring: Int32Array | undefined, arcStart: Uint32Array, xyz: Float32Array) {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  const each = (fn: (i: number) => void) => {
    if (!ring) return;
    for (const ref of ring) {
      const a = ref < 0 ? ~ref : ref;
      for (let i = arcStart[a]; i < arcStart[a + 1]; i++) fn(i);
    }
  };
  each((i) => {
    sx += xyz[i * 3];
    sy += xyz[i * 3 + 1];
    sz += xyz[i * 3 + 2];
  });
  const len = Math.hypot(sx, sy, sz) || 1;
  const cx = sx / len;
  const cy = sy / len;
  const cz = sz / len;
  let minDot = 1;
  each((i) => {
    const d = cx * xyz[i * 3] + cy * xyz[i * 3 + 1] + cz * xyz[i * 3 + 2];
    if (d < minDot) minDot = d;
  });
  return { cx, cy, cz, radius: Math.acos(Math.max(-1, Math.min(1, minDot))) };
}

/** The feature's rings as GeoJSON (every point), for exact hit-testing. */
export function geomToGeoJson(lod: Lod, geom: Geom): number[][][][] {
  return geom.polys.map((poly) =>
    poly.rings.map((ring) => {
      const coords: number[][] = [];
      ring.forEach((ref, k) => {
        const rev = ref < 0;
        const a = rev ? ~ref : ref;
        const s = lod.arcStart[a];
        const e = lod.arcStart[a + 1] - 1;
        for (let j = 0; j <= e - s; j++) {
          if (k > 0 && j === 0) continue; // shared with the previous arc's end
          const i = rev ? e - j : s + j;
          coords.push([lod.lon[i], lod.lat[i]]);
        }
      });
      return coords;
    }),
  );
}
