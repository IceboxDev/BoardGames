// Extracts the dominant accent color from each game's thumbnail and writes
// `accent.json` (one per game folder). Run via `pnpm extract-accents`.
//
// Pipeline:
// 1. Center-crop the thumbnail to 70% to skip vignettes / dark borders.
// 2. Run Vibrant.js, get 6 categorized swatches with population counts.
// 3. Pick the swatch with the highest population (most pixel coverage).
// 4. Boost saturation/lightness so muted source colors still register as
//    accents on a near-black UI surface.

import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Vibrant } from "node-vibrant/node";
import sharp from "sharp";

const ROOT = "packages/web/src/games";
const CENTER_CROP = 0.7;

// Saturation floor + lightness window (HSL space). 65% saturation makes hues
// distinct on a dark surface; 40-65% lightness keeps them readable as borders
// and small accents without becoming neon highlights.
const MIN_SAT = 0.65;
const MIN_LIGHT = 0.4;
const MAX_LIGHT = 0.65;

async function centerCrop(path) {
  const meta = await sharp(path).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error(`bad image: ${path}`);
  const cw = Math.floor(w * CENTER_CROP);
  const ch = Math.floor(h * CENTER_CROP);
  const left = Math.floor((w - cw) / 2);
  const top = Math.floor((h - ch) / 2);
  return await sharp(path)
    .extract({ left, top, width: cw, height: ch })
    .toFormat("png")
    .toBuffer();
}

function hexToRgb(hex) {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) throw new Error(`bad hex: ${hex}`);
  return m.map((s) => parseInt(s, 16) / 255);
}

function rgbToHex([r, g, b]) {
  const c = (n) =>
    Math.max(0, Math.min(255, Math.round(n * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l, l, l];
  const hue = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}

function boostHex(hex) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const newS = Math.max(MIN_SAT, s);
  const newL = Math.min(MAX_LIGHT, Math.max(MIN_LIGHT, l));
  return rgbToHex(hslToRgb([h, newS, newL]));
}

const dirents = await readdir(ROOT, { withFileTypes: true });
const slugs = dirents.filter((d) => d.isDirectory()).map((d) => d.name);

let written = 0;
for (const slug of slugs) {
  const candidates = [
    join(ROOT, slug, "assets/thumbnail.png"),
    join(ROOT, slug, "assets/img/thumbnail.png"),
  ];
  const thumb = candidates.find((p) => existsSync(p));
  if (!thumb) {
    console.warn(`[extract-accents] no thumbnail for ${slug}, skipping`);
    continue;
  }

  const cropped = await centerCrop(thumb);
  const palette = await Vibrant.from(cropped).getPalette();
  const swatches = Object.entries(palette).flatMap(([name, s]) =>
    s ? [{ name, hex: s.hex, population: s.population }] : [],
  );
  swatches.sort((a, b) => b.population - a.population);
  const top = swatches[0];
  const raw = top?.hex ?? "#888888";
  const hex = boostHex(raw);

  await writeFile(join(ROOT, slug, "accent.json"), `${JSON.stringify({ hex }, null, 2)}\n`);
  console.log(`[extract-accents] ${slug} → ${hex}  (raw ${raw}, top ${top?.name})`);
  written++;
}

console.log(`[extract-accents] wrote ${written} files`);
