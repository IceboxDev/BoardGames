import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeLod } from "./lod";
import { EDGE_LITE, triangulate } from "./mesh";

function lod(name: string) {
  const buf = readFileSync(
    resolve(process.cwd(), `../core/src/trainers/geography/content/${name}`),
  );
  return decodeLod(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

describe("land mesh", () => {
  it("has no T-junctions (they show up as hairline cracks in the land)", () => {
    const m = triangulate(lod("world-lite.lod.bin"), EDGE_LITE);
    const key = (i: number) =>
      `${m.positions[i * 3].toFixed(6)},${m.positions[i * 3 + 1].toFixed(6)},${m.positions[i * 3 + 2].toFixed(6)}`;
    const vertices = new Set<string>();
    for (let i = 0; i < m.feature.length; i++) vertices.add(key(i));
    // Edges by coordinates, so a border shared by two countries counts twice.
    const uses = new Map<string, [number, number, number]>();
    const edge = (a: number, b: number) => {
      const ka = key(a);
      const kb = key(b);
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const hit = uses.get(k);
      if (hit) hit[0]++;
      else uses.set(k, [1, a, b]);
    };
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
      edge(a, b);
      edge(b, c);
      edge(c, a);
    }
    let tJunctions = 0;
    for (const [count, a, b] of uses.values()) {
      if (count !== 1) continue;
      const x = m.positions[a * 3] + m.positions[b * 3];
      const y = m.positions[a * 3 + 1] + m.positions[b * 3 + 1];
      const z = m.positions[a * 3 + 2] + m.positions[b * 3 + 2];
      const l = Math.hypot(x, y, z);
      const mid = `${(x / l).toFixed(6)},${(y / l).toFixed(6)},${(z / l).toFixed(6)}`;
      if (vertices.has(mid)) tJunctions++;
    }
    expect(tJunctions).toBe(0);
  }, 30000);
});
