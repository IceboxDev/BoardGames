// NOTE: this test file lives inside the directory the theme engine discovers
// with import.meta.glob — the engine's glob must exclude "*.test.ts" (e.g.
// ["./patterns/*.ts", "!./patterns/*.test.ts"]) so this file never lands in
// the production bundle.
import { describe, expect, it } from "vitest";
import circuit from "./circuit";
import constellation from "./constellation";
import crosshatch from "./crosshatch";
import diamonds from "./diamonds";
import doodles from "./doodles";
import dotgrid from "./dotgrid";
import petals from "./petals";
import waves from "./waves";

const PREFIX = 'url("data:image/svg+xml,';
const SUFFIX = '")';

const patterns = [
  doodles,
  constellation,
  waves,
  crosshatch,
  dotgrid,
  circuit,
  petals,
  diamonds,
] as const;

const expected: ReadonlyArray<[key: string, label: string, tile: number]> = [
  ["doodles", "Doodles", 300],
  ["constellation", "Stars", 150],
  ["waves", "Waves", 120],
  ["crosshatch", "Linen", 40],
  ["dotgrid", "Dot grid", 20],
  ["circuit", "Circuit", 100],
  ["petals", "Petals", 200],
  ["diamonds", "Diamonds", 60],
];

function encodedBody(css: string): string {
  expect(css.startsWith(PREFIX)).toBe(true);
  expect(css.endsWith(SUFFIX)).toBe(true);
  return css.slice(PREFIX.length, -SUFFIX.length);
}

describe("pattern modules", () => {
  it("expose the expected key / label / tile contract", () => {
    expect(patterns.map((p) => [p.key, p.label, p.tile])).toEqual(expected);
    for (const pattern of patterns) {
      expect(typeof pattern.generate).toBe("function");
      expect(Number.isInteger(pattern.tile)).toBe(true);
      expect(pattern.tile).toBeGreaterThan(0);
    }
  });

  it("generate() returns an encoded CSS url() with no raw < or #", () => {
    for (const pattern of patterns) {
      const body = encodedBody(pattern.generate("#22d3ee", 0.4));
      expect(body).not.toContain("<");
      expect(body).not.toContain("#");
      expect(body).not.toContain('"');
      expect(body).toContain("%3Csvg");
      expect(body).toContain("%2322d3ee");
    }
  });

  it("decodes to an SVG sized to the declared tile", () => {
    for (const pattern of patterns) {
      const svg = decodeURIComponent(encodedBody(pattern.generate("#ffffff", 0.5)));
      expect(svg.startsWith("<svg xmlns='http://www.w3.org/2000/svg'")).toBe(true);
      expect(svg).toContain(`width='${pattern.tile}' height='${pattern.tile}'`);
      expect(svg).toContain(`viewBox='0 0 ${pattern.tile} ${pattern.tile}'`);
    }
  });

  it("clamps opacity into [0,1]", () => {
    for (const pattern of patterns) {
      expect(pattern.generate("#abcdef", 7)).toBe(pattern.generate("#abcdef", 1));
      expect(pattern.generate("#abcdef", -3)).toBe(pattern.generate("#abcdef", 0));
      expect(pattern.generate("#abcdef", Number.NaN)).toBe(pattern.generate("#abcdef", 0));
    }
  });

  it("falls back to grey for malformed color strings", () => {
    for (const pattern of patterns) {
      // A single quote would otherwise break out of the SVG attribute, since
      // encodeURIComponent leaves quotes unescaped.
      const injected = pattern.generate("#fff' x='", 0.4);
      expect(injected).toBe(pattern.generate("#888888", 0.4));
      expect(pattern.generate("red", 0.4)).toBe(pattern.generate("#888888", 0.4));
      // Well-formed hex passes through in 3, 4, 6, and 8 digit forms.
      for (const good of ["#abc", "#abcd", "#22d3ee", "#22d3ee80"]) {
        expect(decodeURIComponent(encodedBody(pattern.generate(good, 0.4)))).toContain(good);
      }
    }
  });

  it("varies output with opacity and color", () => {
    for (const pattern of patterns) {
      expect(pattern.generate("#abcdef", 0.2)).not.toBe(pattern.generate("#abcdef", 0.8));
      expect(pattern.generate("#abcdef", 0.5)).not.toBe(pattern.generate("#123456", 0.5));
    }
  });

  it("keeps the hand-tuned derived per-element opacities", () => {
    const doodleSvg = decodeURIComponent(encodedBody(doodles.generate("#fff", 0.5)));
    // 0.5 * {0.8, 0.7, 0.6, 0.5} from the original glyph set.
    for (const derived of ["0.4", "0.35", "0.3", "0.25"]) {
      expect(doodleSvg).toContain(`opacity='${derived}'`);
    }
    const starSvg = decodeURIComponent(encodedBody(constellation.generate("#fff", 0.5)));
    expect(starSvg).toContain(`stroke-opacity='${0.5 * 0.3}'`);
  });
});
