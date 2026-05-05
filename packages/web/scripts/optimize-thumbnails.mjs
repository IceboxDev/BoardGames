#!/usr/bin/env node
// Resize every game thumbnail to a sane display size and write WebP.
// Re-run after adding a new game's PNG. Idempotent: skips files whose
// .webp is newer than the source PNG.
//
// Why: the source thumbnails are 1536×1024 / 1672×941 PNGs at ~2.7 MB each,
// but the carousel renders them at ~270 px tall and the ranked list at
// 80×80 px. Shipping ~2× the largest display size at high quality keeps
// retina screens crisp while keeping each file in the 60–120 KB range
// (vs the original ~2.7 MB).

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gamesDir = path.resolve(__dirname, "..", "src", "games");

const TARGETS = [
  { glob: "thumbnail.png", subdir: "assets" },
  { glob: "thumbnail.png", subdir: path.join("assets", "img") },
];

const MAX_WIDTH = 1024;
const WEBP_QUALITY = 88;

async function findThumbnails() {
  const slugs = await fs.readdir(gamesDir, { withFileTypes: true });
  const out = [];
  for (const dirent of slugs) {
    if (!dirent.isDirectory()) continue;
    for (const t of TARGETS) {
      const p = path.join(gamesDir, dirent.name, t.subdir, t.glob);
      try {
        await fs.access(p);
        out.push(p);
      } catch {}
    }
  }
  return out;
}

async function isUpToDate(srcPng, destWebp) {
  try {
    const [s, d] = await Promise.all([fs.stat(srcPng), fs.stat(destWebp)]);
    return d.mtimeMs >= s.mtimeMs;
  } catch {
    return false;
  }
}

async function optimize(src) {
  const dest = src.replace(/\.png$/i, ".webp");
  if (await isUpToDate(src, dest)) {
    process.stdout.write(`skip  ${path.relative(gamesDir, src)}\n`);
    return { srcBytes: 0, destBytes: 0, skipped: true };
  }
  const srcBytes = (await fs.stat(src)).size;
  await sharp(src)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 6 })
    .toFile(dest);
  const destBytes = (await fs.stat(dest)).size;
  const ratio = (1 - destBytes / srcBytes) * 100;
  process.stdout.write(
    `done  ${path.relative(gamesDir, src)}  ${(srcBytes / 1024).toFixed(0)}KB → ${(destBytes / 1024).toFixed(0)}KB (-${ratio.toFixed(0)}%)\n`,
  );
  return { srcBytes, destBytes, skipped: false };
}

const files = await findThumbnails();
let totalSrc = 0;
let totalDest = 0;
for (const f of files) {
  const r = await optimize(f);
  if (!r.skipped) {
    totalSrc += r.srcBytes;
    totalDest += r.destBytes;
  }
}
console.log(
  `\n${(totalSrc / 1048576).toFixed(1)} MB → ${(totalDest / 1048576).toFixed(1)} MB across ${files.length} thumbnails`,
);
