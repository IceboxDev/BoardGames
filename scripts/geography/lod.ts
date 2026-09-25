// The globe's multi-resolution geometry as one compact binary.
//
// Built from a PRESIMPLIFIED TopoJSON (every point carries its
// Visvalingam weight: the spherical area, in steradians, of the triangle
// it would take away). A point's weight becomes an importance level,
// `floor(-log2(weight))` (0 = arc endpoint, always drawn); the renderer
// draws only points whose level is at most what the current zoom resolves,
// so detail grows smoothly with zoom and the whole world ships in one file.
//
// Layout (all integers zigzag/LEB128 varints unless noted):
//   "GLOD" · u8 version
//   nIds, then per id: byte length + UTF-8
//   nArcs, then per arc its nPoints; then three columns over all points —
//     every dLon, every dLat (1e-3° units, delta from the previous point of
//     the arc), every level — columns compress far better than rows
//   per id: nPolygons, per polygon: nRings, per ring: nRefs, refs
//     (arc index; ~i = arc i reversed, TopoJSON style)

import type { GeometryCollection, Topology } from "topojson-specification";

export const LOD_UNIT = 1e-3;
/** Points finer than this are never resolved on screen (≈ 30 m wiggles). */
export const LOD_MAX_LEVEL = 30;

class Writer {
  private bytes: number[] = [];
  u8(v: number) {
    this.bytes.push(v & 0xff);
  }
  uvar(v: number) {
    let x = v >>> 0;
    while (x >= 0x80) {
      this.bytes.push((x & 0x7f) | 0x80);
      x >>>= 7;
    }
    this.bytes.push(x);
  }
  svar(v: number) {
    this.uvar(v >= 0 ? v * 2 : -v * 2 - 1);
  }
  text(s: string) {
    const b = Buffer.from(s, "utf8");
    this.uvar(b.length);
    for (const x of b) this.bytes.push(x);
  }
  buffer(): Buffer {
    return Buffer.from(this.bytes);
  }
}

export function levelOf(weight: number): number {
  if (!Number.isFinite(weight)) return 0;
  if (weight <= 0) return 63;
  return Math.min(63, Math.max(1, Math.floor(-Math.log2(weight))));
}

type Ring = number[];
type PolygonArcs = Ring[];

function polygonsOf(g: GeometryCollection["geometries"][number]): PolygonArcs[] {
  const any = g as unknown as { type: string; arcs?: unknown };
  if (any.type === "Polygon") return [any.arcs as PolygonArcs];
  if (any.type === "MultiPolygon") return any.arcs as PolygonArcs[];
  return [];
}

/**
 * Encode `objectName` of a presimplified topology. `maxLevel` drops finer
 * points (a lighter first-paint file uses a low one; endpoints always stay).
 */
export function encodeLod(topo: Topology, objectName: string, maxLevel = LOD_MAX_LEVEL): Buffer {
  const obj = topo.objects[objectName] as GeometryCollection;
  const w = new Writer();
  for (const c of "GLOD") w.u8(c.charCodeAt(0));
  w.u8(1);
  w.uvar(obj.geometries.length);
  for (const g of obj.geometries) w.text(String(g.id));
  const arcs = topo.arcs as unknown as number[][][];
  const kept = arcs.map((arc) =>
    arc.filter((p, i) => i === 0 || i === arc.length - 1 || levelOf(p[2]) <= maxLevel),
  );
  w.uvar(kept.length);
  for (const arc of kept) w.uvar(arc.length);
  for (const axis of [0, 1]) {
    for (const arc of kept) {
      let prev = 0;
      for (const p of arc) {
        const v = Math.round(p[axis] / LOD_UNIT);
        w.svar(v - prev);
        prev = v;
      }
    }
  }
  for (const arc of kept) for (const p of arc) w.uvar(levelOf(p[2]));
  for (const g of obj.geometries) {
    const polys = polygonsOf(g);
    w.uvar(polys.length);
    for (const poly of polys) {
      w.uvar(poly.length);
      for (const ring of poly) {
        w.uvar(ring.length);
        for (const ref of ring) w.svar(ref);
      }
    }
  }
  return w.buffer();
}
