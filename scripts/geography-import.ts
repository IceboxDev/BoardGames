// Build the World Geography deck from Natural Earth (public domain).
//
//   pnpm geography-import [--refresh]
//
// Downloads (and caches in node_modules/.cache/geography-import) the 50m and
// 110m admin-0 countries and the 10m populated places, applies the curation
// in scripts/geography/curation.ts and writes
//   packages/core/src/trainers/geography/content/places.json
//   packages/core/src/trainers/geography/content/world-50m.topo.json  (countries + land)
//   packages/core/src/trainers/geography/content/world-110m.topo.json (land, for dragging)

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { geoArea, geoBounds } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature, mergeArcs, mesh, neighbors } from "topojson-client";
import { topology } from "topojson-server";
import { presimplify, quantile, simplify, sphericalTriangleArea } from "topojson-simplify";
import type { GeometryCollection, Topology } from "topojson-specification";
import {
  type City,
  type Continent,
  type Country,
  type Places,
  PlacesSchema,
  type Subregion,
  type Territory,
} from "../packages/core/src/trainers/geography/content-types.ts";
import {
  ALSO_CONTINENTS,
  CAPITAL_OVERRIDE,
  CITY_NAMES,
  CITY_RULES,
  CONTINENT_OVERRIDE,
  CONTINENT_SPLIT,
  CONTINENTS,
  COUNTRY_NAMES,
  EXTRA_STATES,
  LANDLOCKED_OVERRIDE,
  MERGE_INTO,
  NE_CODE,
  SUBREGION_DE,
  SUBREGION_OVERRIDE,
  SUBREGION_ORDER,
  TINY_KM2,
  UN_MEMBERS,
} from "./geography/curation.ts";
import { encodeLod } from "./geography/lod.ts";

/** The first-paint file keeps points down to this level (a whole globe on a large screen). */
const LITE_LEVEL = 20;

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../packages/core/src/trainers/geography/content");
const cacheDir = resolve(here, "../node_modules/.cache/geography-import");
const refresh = process.argv.includes("--refresh");
const NE_BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";
const EARTH_KM = 6371;

type Props = Record<string, unknown>;

async function load(name: string): Promise<FeatureCollection<Geometry, Props>> {
  mkdirSync(cacheDir, { recursive: true });
  const path = join(cacheDir, `${name}.geojson`);
  if (refresh || !existsSync(path)) {
    const res = await fetch(`${NE_BASE}/${name}.geojson`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    writeFileSync(path, await res.text());
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const uniq = (xs: string[], not: string[]) => {
  const seen = new Set(not.map((x) => x.toLowerCase()));
  const out: string[] = [];
  for (const x of xs) {
    const k = x.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x.trim());
  }
  return out;
};

async function main() {
const ne50 = await load("ne_50m_admin_0_countries");
const ne110 = await load("ne_110m_admin_0_countries");
  const ne10 = await load("ne_10m_admin_0_countries");
const nePlaces = await load("ne_10m_populated_places");

// ── Countries geometry ─────────────────────────────────────────────────

const quizCodes = [...UN_MEMBERS, ...EXTRA_STATES];
if (UN_MEMBERS.length !== 193) throw new Error(`UN list has ${UN_MEMBERS.length} codes`);
const neOf = (code: string) => NE_CODE[code] ?? code;
const codeOfNe = new Map(quizCodes.map((c) => [neOf(c), c]));

const features: Feature<Geometry, Props>[] = ne50.features.map((f) => ({
  ...f,
  id: str(f.properties.ADM0_A3),
}));
const byNe = new Map(features.map((f) => [String(f.id), f]));
for (const code of quizCodes) {
  if (!byNe.has(neOf(code))) throw new Error(`no 50m feature for ${code}`);
}

const topo = buildWorld(features, 1e5, null);
const countriesObj = topo.objects.countries as GeometryCollection<Props>;
// The globe: Natural Earth 10m with every point's simplification weight,
// encoded into one multi-resolution binary (see geography/lod.ts).
const topo10 = buildWorld(
  ne10.features.map((f) => ({ ...f, id: str(f.properties.ADM0_A3) })),
  1e7,
  "weights",
);

/**
 * A TopoJSON world: `countries` (de-facto states folded into their country,
 * properties slimmed to the quiz id — or a territory's names and continent)
 * and the merged `land`.
 */
function buildWorld(
  fs: Feature<Geometry, Props>[],
  quantize: number,
  keep: number | null | "weights",
): Topology {
  let t = topology({ countries: { type: "FeatureCollection", features: fs } }, quantize) as Topology;
  if (keep === "weights") {
    t = presimplify(t, sphericalTriangleArea);
  } else if (keep !== null) {
    t = presimplify(t);
    keepRings(t);
    t = simplify(t, quantile(t, keep));
  }
  const obj = t.objects.countries as GeometryCollection<Props>;
  for (const [from, into] of Object.entries(MERGE_INTO)) {
    const a = obj.geometries.findIndex((g) => g.id === from);
    const b = obj.geometries.findIndex((g) => g.id === into);
    if (b < 0) throw new Error(`merge ${from} → ${into}: missing`);
    if (a < 0) continue; // the coarse map may not draw the de-facto state at all
    const merged = mergeArcs(t, [
      obj.geometries[a] as never,
      obj.geometries[b] as never,
    ]) as unknown as GeometryCollection<Props>["geometries"][number];
    merged.id = into;
    merged.properties = obj.geometries[b].properties;
    obj.geometries = obj.geometries.filter((_, i) => i !== a && i !== b).concat(merged);
  }
  for (const g of obj.geometries) {
    const p = (g.properties ?? {}) as Props;
    const code = codeOfNe.get(String(g.id));
    g.properties = code
      ? { q: `co:${code}` }
      : {
          en: str(p.NAME_EN),
          de: str(p.NAME_DE) || str(p.NAME_EN),
          c: CONTINENTS.find((x) => x.ne === str(p.CONTINENT))?.code ?? null,
        };
  }
  fixWinding(t, obj);
  t.objects.land = mergeArcs(t, obj.geometries as never) as never;
  return t;
}

// ── Countries data ─────────────────────────────────────────────────────

const geoIndex = new Map(countriesObj.geometries.map((g, i) => [String(g.id), i]));
const neighbourIdx = neighbors(countriesObj.geometries as never);
// Arcs used once are coast; a country with none is landlocked.
const arcUse = new Map<number, number>();
const arcsOf = (g: unknown): number[] => {
  const out: number[] = [];
  const walk = (x: unknown) => {
    if (typeof x === "number") out.push(x < 0 ? ~x : x);
    else if (Array.isArray(x)) for (const y of x) walk(y);
  };
  walk((g as { arcs?: unknown }).arcs);
  return out;
};
for (const g of countriesObj.geometries) {
  for (const a of new Set(arcsOf(g))) arcUse.set(a, (arcUse.get(a) ?? 0) + 1);
}

const continentOf = (code: string, ne: string): Continent["code"] => {
  const o = CONTINENT_OVERRIDE[code];
  if (o) return o;
  const c = CONTINENTS.find((x) => x.ne === ne);
  if (!c) throw new Error(`${code}: continent ${ne}`);
  return c.code;
};

const countries: Country[] = [];
const subregionSet = new Map<string, Subregion["continent"]>();
for (const code of quizCodes) {
  const ne = neOf(code);
  const f = byNe.get(ne);
  if (!f) throw new Error(code);
  const p = f.properties;
  const continent = continentOf(code, str(p.CONTINENT));
  const sub = SUBREGION_OVERRIDE[code] ?? str(p.SUBREGION);
  if (!SUBREGION_DE[sub]) throw new Error(`${code}: subregion ${sub}`);
  subregionSet.set(sub, continent);
  const names = COUNTRY_NAMES[code] ?? {};
  const nameEn = names.en ?? str(p.NAME_EN);
  const nameDe = names.de ?? str(p.NAME_DE);
  const gi = geoIndex.get(ne);
  if (gi === undefined) throw new Error(`${code}: no geometry`);
  const parts = [f, ...Object.entries(MERGE_INTO).flatMap(([from, into]) => (into === ne ? [byNe.get(from)] : []))];
  const areaKm2 = Math.round(
    parts.reduce((sum, part) => sum + (part ? sphereArea(part) : 0), 0) * EARTH_KM * EARTH_KM,
  );
  const arcs = arcsOf(countriesObj.geometries[gi]);
  const coastal = arcs.some((a) => arcUse.get(a) === 1);
  countries.push({
    id: `co:${code}`,
    kind: "country",
    feature: ne,
    nameEn,
    nameDe,
    aliases: uniq(
      [str(p.NAME_EN), str(p.NAME_DE), str(p.NAME), str(p.NAME_LONG), ...(names.aliases ?? [])],
      [nameEn, nameDe],
    ),
    continent,
    alsoContinents: ALSO_CONTINENTS[code] ?? [],
    split: CONTINENT_SPLIT[code] ?? null,
    subregion: `sr:${slug(sub)}`,
    order: 0,
    focus: [round(num(p.LABEL_X)), round(num(p.LABEL_Y))],
    areaKm2,
    pop: Math.round(num(p.POP_EST)),
    tiny: areaKm2 < TINY_KM2,
    landlocked: LANDLOCKED_OVERRIDE.has(code) || !coastal,
    neighbours: [],
    capital: null,
  });
}
const countryByFeature = new Map(countries.map((c) => [c.feature, c]));
for (const c of countries) {
  const gi = geoIndex.get(c.feature);
  if (gi === undefined) continue;
  c.neighbours = neighbourIdx[gi]
    .map((j) => countryByFeature.get(String(countriesObj.geometries[j].id))?.id)
    .filter((x): x is string => !!x)
    .sort();
}
// Most salient first inside each subregion: big and populous before tiny.
const salience = (c: Country) => Math.log10(c.areaKm2 + 1) + Math.log10(c.pop + 1);
const bySub = Map.groupBy(countries, (c) => c.subregion);
for (const group of bySub.values()) {
  group.sort((a, b) => salience(b) - salience(a) || a.id.localeCompare(b.id));
  group.forEach((c, i) => {
    c.order = i;
  });
}

const subregions: Subregion[] = [...subregionSet.entries()]
  .map(([name, continent]) => {
    const order = SUBREGION_ORDER.indexOf(name);
    if (order < 0) throw new Error(`subregion order: ${name}`);
    return {
      id: `sr:${slug(name)}`,
      continent,
      nameEn: name,
      nameDe: SUBREGION_DE[name],
      order,
    };
  })
  .sort((a, b) => a.order - b.order);
// Renumber per continent.
for (const group of Map.groupBy(subregions, (s) => s.continent).values()) {
  group.forEach((s, i) => {
    s.order = i;
  });
}

// ── Cities ─────────────────────────────────────────────────────────────

const countryByNe = new Map(countries.map((c) => [c.feature, c]));
const countryByCode = new Map(countries.map((c) => [c.id.slice(3), c]));
const mergedNe = new Map(Object.entries(MERGE_INTO));
const cityPool = new Map<string, { f: Props; country: Country }[]>();
for (const f of nePlaces.features) {
  const p = f.properties;
  const ne = str(p.ADM0_A3);
  const country =
    countryByNe.get(mergedNe.get(ne) ?? ne) ?? countryByCode.get(ne);
  if (!country) continue;
  const list = cityPool.get(country.id) ?? [];
  list.push({ f: p, country });
  cityPool.set(country.id, list);
}

const cities: City[] = [];
for (const country of countries) {
  // Rank by the UN's 2020 urban population where Natural Earth has it (the
  // other fields mix metro areas and city limits), else by its own maximum.
  const pool = (cityPool.get(country.id) ?? []).sort(
    (a, b) =>
      Number(num(a.f.POP2020) === 0) - Number(num(b.f.POP2020) === 0) ||
      cityPop(b.f) - cityPop(a.f) ||
      str(a.f.NAME).localeCompare(str(b.f.NAME)),
  );
  const code = country.id.slice(3);
  const want = CAPITAL_OVERRIDE[code];
  const capital =
    (want && pool.find((x) => str(x.f.NAME) === want || str(x.f.NAME_EN) === want)) ||
    pool.find((x) => num(x.f.ADM0CAP) === 1 && str(x.f.FEATURECLA) === "Admin-0 capital") ||
    pool.find((x) => num(x.f.ADM0CAP) === 1) ||
    pool.find((x) => str(x.f.FEATURECLA) === "Admin-0 capital");
  if (!capital) {
    console.warn(`  ${code}: no capital in Natural Earth — no cities`);
    continue;
  }
  const picked = [capital];
  for (const x of pool) {
    if (picked.length >= CITY_RULES.max) break;
    if (picked.includes(x)) continue;
    const rank = picked.length;
    if (rank >= CITY_RULES.top && num(x.f.POP2020) * 1000 < CITY_RULES.bigPop) break;
    // Skip near-duplicates (a second point for the same city).
    if (picked.some((y) => str(y.f.NAME) === str(x.f.NAME))) continue;
    picked.push(x);
  }
  picked.forEach((x, i) => {
    const p = x.f;
    const fix = CITY_NAMES[str(p.NAME)] ?? {};
    const nameEn = fix.en ?? (str(p.NAME_EN) || str(p.NAME));
    const nameDe = fix.de ?? (str(p.NAME_DE) || nameEn);
    const id = `ci:${num(p.NE_ID)}`;
    cities.push({
      id,
      kind: "city",
      nameEn,
      nameDe,
      aliases: uniq(
        [str(p.NAME), str(p.NAME_EN), str(p.NAME_DE), str(p.NAMEASCII), ...str(p.NAMEALT).split("|"), ...(fix.aliases ?? [])],
        [nameEn, nameDe],
      ),
      country: country.id,
      at: [round(num(p.LONGITUDE)), round(num(p.LATITUDE))],
      pop: Math.round(cityPop(p)),
      capital: x === capital,
      order: i,
    });
    if (x === capital) country.capital = id;
  });
}

// ── Continents, territories, write ─────────────────────────────────────

const continents: Continent[] = CONTINENTS.map((c) => ({
  id: `ct:${c.code}`,
  kind: "continent",
  code: c.code,
  nameEn: c.nameEn,
  nameDe: c.nameDe,
  aliases: c.aliases,
  focus: c.focus,
}));

const territories: Territory[] = countriesObj.geometries
  .filter((g) => !codeOfNe.has(String(g.id)))
  .map((g) => {
    const p = (g.properties ?? {}) as Props;
    const continent = p.c;
    return {
      feature: String(g.id),
      nameEn: str(p.en),
      nameDe: str(p.de) || str(p.en),
      continent: typeof continent === "string" ? continent : null,
    };
  });

const body = { continents, subregions, countries, cities, territories };
const version = createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 12);
const places: Places = PlacesSchema.parse({ version, ...body });

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "places.json"), `${JSON.stringify(places)}\n`);
for (const old of ["world-50m.topo.json", "world-110m.topo.json", "world-10m-borders.topo.json"]) {
  rmSync(join(outDir, old), { force: true });
}
rmSync(join(outDir, "world-10m"), { recursive: true, force: true });
// First paint: only what a whole-earth view resolves; then the full detail.
writeFileSync(join(outDir, "world-lite.lod.bin"), encodeLod(topo10, "countries", LITE_LEVEL));
writeFileSync(join(outDir, "world.lod.bin"), encodeLod(topo10, "countries"));
const kb = (f: string) => Math.round(readFileSync(join(outDir, f)).length / 1024);
console.log(
  `geography v${version}: ${continents.length} continents, ${subregions.length} subregions, ${countries.length} countries (${countries.filter((c) => c.tiny).length} tiny, ${countries.filter((c) => c.landlocked).length} landlocked), ${cities.length} cities, ${territories.length} territories — places ${kb("places.json")} KB, globe ${kb("world-lite.lod.bin")} KB lite + ${kb("world.lod.bin")} KB full`,
);

}

function cityPop(p: Props): number {
  const un = num(p.POP2020);
  return un > 0 ? un * 1000 : num(p.POP_MAX);
}

/**
 * Simplification can turn a tiny ring inside out; d3 then reads the polygon
 * as "everything but this island" and fills the whole globe. Any polygon
 * covering more than a hemisphere is flipped back (its rings reversed).
 */
function fixWinding(t: Topology, obj: GeometryCollection<Props>): void {
  for (const g of obj.geometries) {
    const polys: number[][][] =
      g.type === "Polygon"
        ? [(g as unknown as { arcs: number[][] }).arcs]
        : g.type === "MultiPolygon"
          ? (g as unknown as { arcs: number[][][] }).arcs
          : [];
    for (const poly of polys) {
      const f = feature(t, { type: "Polygon", arcs: poly } as never) as unknown as Feature;
      if (geoArea(f) <= 2 * Math.PI) continue;
      for (const ring of poly) {
        ring.reverse();
        for (let i = 0; i < ring.length; i++) ring[i] = ~ring[i];
      }
      console.warn(`  ${String(g.id)}: flipped an inverted polygon`);
    }
  }
}

/** Spherical area in steradians, whatever the ring winding. */
function sphereArea(f: Feature): number {
  const a = geoArea(f);
  return a > 2 * Math.PI ? 4 * Math.PI - a : a;
}

/**
 * Simplification may drop every interior point of a small closed ring (an
 * island, a microstate) and flatten it to nothing: pin the three heaviest
 * points of every closed arc so each ring survives as at least a triangle.
 */
function keepRings(t: Topology): void {
  for (const arc of t.arcs as unknown as number[][][]) {
    const first = arc[0];
    const last = arc[arc.length - 1];
    if (arc.length < 4 || first[0] !== last[0] || first[1] !== last[1]) continue;
    const inner = arc.slice(1, -1).sort((a, b) => (b[2] ?? 0) - (a[2] ?? 0));
    for (const p of inner.slice(0, 3)) p[2] = Number.POSITIVE_INFINITY;
  }
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
