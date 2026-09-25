import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { geoArea, geoOrthographic } from "d3-geo";
import { describe, expect, it } from "vitest";
import { distanceKm, distanceToFeatureKm, featureAt, meridianBand } from "./geo";
import { decodeLod } from "./lod";
import { makeView, project } from "./render";
import { worldOf } from "./world";

// The real globe data, straight from disk (the app fetches it).
function lod(name: string) {
  const buf = readFileSync(
    resolve(process.cwd(), `../core/src/trainers/geography/content/${name}`),
  );
  return decodeLod(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

const full = lod("world.lod.bin");
const world = worldOf(full);

describe("globe data", () => {
  it("decodes both cuts with the same features, the light one with fewer points", () => {
    const lite = lod("world-lite.lod.bin");
    expect(lite.ids).toEqual(full.ids);
    expect(lite.lon.length).toBeLessThan(full.lon.length / 2);
    expect(full.borderArcs.length).toBeGreaterThan(100);
  });

  it("has no country turned inside out (it would paint the whole globe)", () => {
    let land = 0;
    for (const id of full.ids) {
      const s = world.shape(id);
      if (!s) continue;
      const a = geoArea(s);
      expect(a, id).toBeLessThan(2 * Math.PI);
      land += a;
    }
    // Land is about 29 % of the sphere.
    expect(land / (4 * Math.PI)).toBeGreaterThan(0.26);
    expect(land / (4 * Math.PI)).toBeLessThan(0.31);
  });
});

describe("projection", () => {
  it("matches d3's rotated orthographic projection", () => {
    const [w, h, r, lambda, phi] = [800, 600, 280, -20, -45];
    const d3 = geoOrthographic()
      .rotate([lambda, phi])
      .scale(r)
      .translate([w / 2, h / 2]);
    const v = makeView(w, h, r, lambda, phi);
    const out = new Float64Array(2);
    for (const [lon, lat] of [
      [20, 45],
      [30, 50],
      [0, 10],
      [60, 70],
    ]) {
      const L = (lon * Math.PI) / 180;
      const P = (lat * Math.PI) / 180;
      const front = project(
        v,
        Math.cos(P) * Math.cos(L),
        Math.cos(P) * Math.sin(L),
        Math.sin(P),
        out,
      );
      expect(front).toBe(true);
      const ref = d3([lon, lat]) ?? [0, 0];
      expect(out[0]).toBeCloseTo(ref[0], 6);
      expect(out[1]).toBeCloseTo(ref[1], 6);
    }
    // The antipode of the view centre is on the far side.
    expect(project(v, -v.dx, -v.dy, -v.dz, out)).toBe(false);
  });

  it("resolves more detail the closer the globe", () => {
    expect(makeView(800, 600, 280, 0, 0).maxLevel).toBeLessThan(
      makeView(800, 600, 8000, 0, 0).maxLevel,
    );
  });
});

describe("geo helpers", () => {
  it("finds the country under a point", () => {
    expect(featureAt(world, [13.4, 52.5])).toBe("DEU"); // Berlin
    expect(featureAt(world, [-40, 30])).toBeNull(); // the Atlantic
    expect(featureAt(world, [-40, 72])).toBe("GRL");
    expect(featureAt(world, [63.3, 45.6])).toBe("KAZ"); // Baikonur, folded into Kazakhstan
  });

  it("measures great-circle and outline distances", () => {
    expect(distanceKm([13.4, 52.52], [2.35, 48.86])).toBeCloseTo(878, -1); // Berlin–Paris
    expect(distanceToFeatureKm(world, "DEU", [13.4, 52.5])).toBe(0);
    expect(distanceToFeatureKm(world, "DEU", [7.75, 48.58])).toBeLessThan(15); // Strasbourg
    const paris = distanceToFeatureKm(world, "DEU", [2.35, 48.86]);
    expect(paris).toBeGreaterThan(200);
    expect(paris).toBeLessThan(400);
  });

  it("builds a meridian band covering one side only", () => {
    const west = meridianBand(60, "west");
    expect(geoArea(west)).toBeLessThan(2 * Math.PI);
    expect(geoArea(west)).toBeGreaterThan(Math.PI);
  });
});
