import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { centreBadge, findBadgeCircle, toRgba } from "./avatar-circle.ts";

// Synthetic badges drawn as SVG: the circle's true centre and radius are
// known, so the fit can be held to them. Pixel centres sit at +0.5, so a
// fitted centre of cx means an SVG centre of cx + 0.5.

const S = 256;
const svg = (body: string, bg = "none") =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="${bg}"/>${body}</svg>`,
    ),
  )
    .png()
    .toBuffer();

async function fit(buf: Buffer) {
  return findBadgeCircle(await toRgba(buf));
}

describe("findBadgeCircle", () => {
  it("finds an off-centre badge on a transparent square", async () => {
    const c = await fit(await svg(`<circle cx="124" cy="138" r="118" fill="#7a3b1c"/>`));
    expect(c).not.toBeNull();
    expect(c?.cx).toBeCloseTo(123.5, 0);
    expect(Math.abs((c?.cx ?? 0) + 0.5 - 124)).toBeLessThan(0.5);
    expect(Math.abs((c?.cy ?? 0) + 0.5 - 138)).toBeLessThan(0.5);
    expect(Math.abs((c?.r ?? 0) - 118)).toBeLessThan(0.75);
    expect(c?.flush).toBe(false);
  });

  it("lands on the OUTER edge of a light rim on a cream square", async () => {
    const c = await fit(
      await svg(
        `<circle cx="130" cy="126" r="120" fill="#cfc6b0"/><circle cx="130" cy="126" r="114" fill="#1f5a44"/>`,
        "#fef6e1",
      ),
    );
    expect(Math.abs((c?.r ?? 0) - 120)).toBeLessThan(0.75);
    expect(Math.abs((c?.cx ?? 0) + 0.5 - 130)).toBeLessThan(0.5);
  });

  it("ignores a prop poking out of the badge, and reports it as spill", async () => {
    const c = await fit(
      await svg(
        `<circle cx="128" cy="132" r="110" fill="#203060"/><rect x="200" y="10" width="40" height="60" fill="#e0c040"/>`,
        "#000000",
      ),
    );
    expect(Math.abs((c?.r ?? 0) - 110)).toBeLessThan(0.75);
    expect(c?.spillPct).toBeGreaterThan(1);
  });

  it("flags a badge that is already centred and edge to edge", async () => {
    const c = await fit(await svg(`<circle cx="128" cy="128" r="128" fill="#336699"/>`, "#ffffff"));
    // The circle touches the border at four points; the rest of the rays still find it.
    expect(c?.flush).toBe(true);
  });

  it("leaves pictures that aren't round badges alone", async () => {
    const noise = await sharp(
      Buffer.from(Array.from({ length: S * S * 3 }, (_, i) => (i * 37) % 251)),
      {
        raw: { width: S, height: S, channels: 3 },
      },
    )
      .png()
      .toBuffer();
    expect(await fit(noise)).toBeNull();
    const figure = await svg(
      `<rect x="70" y="40" width="116" height="216" rx="30" fill="#ffffff"/><circle cx="128" cy="60" r="34" fill="#c08060"/>`,
      "#f6ecd2",
    );
    expect(await fit(figure)).toBeNull();
  });
});

describe("centreBadge", () => {
  it("puts the circle in the middle, edge to edge, with transparent corners", async () => {
    const src = await svg(
      `<circle cx="120" cy="140" r="112" fill="#cfc6b0"/><circle cx="120" cy="140" r="106" fill="#1f5a44"/>`,
      "#fef6e1",
    );
    const c = await fit(src);
    if (!c) throw new Error("no circle");
    const out = await centreBadge(src, c);
    const img = await toRgba(out);
    expect([img.width, img.height]).toEqual([S, S]);
    const alpha = (x: number, y: number) => img.data[(y * S + x) * 4 + 3];
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(S - 1, S - 1)).toBe(0);
    expect(alpha(128, 4)).toBe(255);
    expect(alpha(4, 128)).toBe(255);
    // The rim survives: the pixel just inside the top edge is rim, not cream.
    const at = (x: number, y: number) => {
      const i = (y * S + x) * 4;
      return [img.data[i], img.data[i + 1], img.data[i + 2]];
    };
    expect(at(128, 3)[0]).toBeLessThan(225);
    // Re-fitting the result finds a flush circle.
    const again = findBadgeCircle(img);
    expect(again?.flush ?? false).toBe(true);
  });
});
