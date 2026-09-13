#!/usr/bin/env node
// Turn the generated Sensō card-art PNGs into the small webp blocks the
// compositor draws. Re-run after dropping new PNGs into art-src. Idempotent:
// skips blocks whose webp is newer than the source, the manifest and this
// script.
//
//   pnpm --filter @boardgames/web card-art            # convert what changed
//   pnpm --filter @boardgames/web card-art --force    # convert everything
//   pnpm --filter @boardgames/web card-art --only=crest-oda
//   pnpm --filter @boardgames/web card-art --strict   # exit 1 on orphans / budget
//
// Why: the raw PNGs are 1–3 MB each and never enter git (`packages/web/art-src`
// is gitignored; *.png is LFS-tracked and LFS bandwidth has already blocked a
// deploy). Each block is trimmed to its alpha bounds so the layout can rely on
// the art filling its box, shrunk to the manifest's `maxPx` (2× DPR at its
// largest on-screen use: a figure is 85 px wide in the fan and 170 px in the
// preview, a ribbon kanji 29 px, a back at most 160 px) and encoded lossy —
// the pigments carry paper grain, which near-lossless cannot compress. The
// two textures are full-bleed layers, not repeats: a mirror-tiled seigaiha
// would flip its scallops at every seam. Budget: 1 MB for the whole deck,
// loaded only by this game and warmed while the lobby is up.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, "..", "art-src", "senso-cards");
const OUT_DIR = path.resolve(
  __dirname,
  "..",
  "src",
  "games",
  "senso-battle-for-japan",
  "assets",
  "cards",
);
const MANIFEST = path.join(OUT_DIR, "manifest.json");
const SELF = fileURLToPath(import.meta.url);
const BUDGET_BYTES = 1024 * 1024;

const ENCODE = {
  crest: { quality: 80, alphaQuality: 75, smartSubsample: true, effort: 6 },
  kanji: { quality: 78, alphaQuality: 70, effort: 6 },
  seal: { quality: 80, alphaQuality: 75, effort: 6 },
  emblem: { quality: 78, alphaQuality: 70, effort: 6 },
  figure: { quality: 76, alphaQuality: 70, smartSubsample: true, effort: 6 },
  halo: { quality: 70, alphaQuality: 60, effort: 6 },
  tile: { quality: 55, alphaQuality: 55, effort: 6 },
  ornament: { quality: 80, alphaQuality: 75, effort: 6 },
};

const args = process.argv.slice(2);
const force = args.includes("--force");
const strict = args.includes("--strict");
const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);

async function mtime(file) {
  try {
    return (await fs.stat(file)).mtimeMs;
  } catch {
    return null;
  }
}

async function isUpToDate(src, dest) {
  const [s, d, m, self] = await Promise.all([
    mtime(src),
    mtime(dest),
    mtime(MANIFEST),
    mtime(SELF),
  ]);
  if (s == null || d == null) return false;
  return d >= Math.max(s, m ?? 0, self ?? 0);
}

async function convert(name, entry) {
  const src = path.join(SRC_DIR, `${entry.src ?? name}.png`);
  const dest = path.join(OUT_DIR, `${name}.webp`);
  if ((await mtime(src)) == null) return { name, status: "no-source" };
  if (!force && (await isUpToDate(src, dest))) {
    return { name, status: "up-to-date", bytes: (await fs.stat(dest)).size };
  }
  let image = sharp(src).ensureAlpha();
  if (entry.trim !== false) image = image.trim({ threshold: 8 });
  const encode = ENCODE[entry.kind] ?? ENCODE.figure;
  const info = await image
    .resize({
      width: entry.maxPx,
      height: entry.maxPx,
      fit: "inside",
      withoutEnlargement: true,
      kernel: "lanczos3",
    })
    .webp(encode)
    .toFile(dest);
  return { name, status: "written", bytes: info.size, width: info.width, height: info.height };
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  await fs.mkdir(OUT_DIR, { recursive: true });
  const names = Object.keys(manifest).filter((n) => !only || n === only);
  const results = [];
  for (const name of names) results.push(await convert(name, manifest[name]));

  const present = (await fs.readdir(OUT_DIR)).filter((f) => f.endsWith(".webp"));
  const orphans = present.map((f) => f.replace(/\.webp$/, "")).filter((n) => !(n in manifest));
  let total = 0;
  for (const f of present) total += (await fs.stat(path.join(OUT_DIR, f))).size;

  const pad = (s, n) => String(s).padEnd(n);
  for (const r of results) {
    const size = r.width ? `${r.width}×${r.height}` : "";
    const kb = r.bytes != null ? `${(r.bytes / 1024).toFixed(1)} KB` : "";
    console.log(
      `${pad(r.name, 22)} ${pad(manifest[r.name].kind, 7)} ${pad(r.status, 11)} ${pad(size, 9)} ${kb}`,
    );
  }
  const missing = results.filter((r) => r.status === "no-source").map((r) => r.name);
  console.log(
    `\n${present.length}/${names.length} blocks on disk, ${(total / 1024).toFixed(1)} KB of ${BUDGET_BYTES / 1024} KB budget`,
  );
  if (missing.length) console.log(`no source yet: ${missing.join(", ")}`);
  if (orphans.length) console.log(`ORPHANS (not in manifest): ${orphans.join(", ")}`);
  const over = total > BUDGET_BYTES;
  if (over) console.log("OVER BUDGET");
  if (strict && (orphans.length || over)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
