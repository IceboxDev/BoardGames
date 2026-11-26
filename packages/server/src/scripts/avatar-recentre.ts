// Re-frame every member's round-badge avatar so the badge is centred and
// flush with the frame (lib/avatar-circle.ts). Dry run by default: writes a
// preview per member plus contact sheets into --out and changes nothing.
//
//   pnpm --filter @boardgames/server exec tsx src/scripts/avatar-recentre.ts --prod --out=<dir>
//   … --apply                   back up every user.image, then write (compare-and-swap)
//   … --only=<id,id>            limit to these members
//   … --source=<id>=<file>      use a higher-resolution original for one member
//   … --oval=<id,id>            these badges are drawn a little out of round:
//                               fit an ellipse and stretch it onto the frame
//   … --inset=<id>=<px>         also trim this many px of the badge's own rim
//
// Members whose picture isn't a round badge (no circle found) or is already
// flush are left alone.

import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import sharp from "sharp";
import {
  AVATAR_PX,
  type BadgeCircle,
  centreBadge,
  findBadgeCircle,
  fitBadgeOval,
  toRgba,
} from "../lib/avatar-circle.ts";
import { describeDbTarget, resolveDbTarget } from "../lib/db-target.ts";

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = process.argv.includes("--apply");
const out = arg("out") ?? "avatar-recentre";
const only = new Set((arg("only") ?? "").split(",").filter(Boolean));
const ovals = new Set((arg("oval") ?? "").split(",").filter(Boolean));
const insets = new Map(
  process.argv
    .filter((a) => a.startsWith("--inset="))
    .map((a) => {
      const [id, px] = a.slice(8).split("=");
      return [id, Number(px)] as const;
    }),
);
const sources = new Map(
  process.argv
    .filter((a) => a.startsWith("--source="))
    .map((a) => a.slice(9).split("=") as [string, string]),
);
const WEB_PUBLIC = new URL("../../../web/public", import.meta.url).pathname;

const target = resolveDbTarget({ argv: process.argv, env: process.env, writes: apply });
console.log(describeDbTarget(target, "avatar recentre"));
const db = createClient({ url: target.url, authToken: target.authToken });
mkdirSync(out, { recursive: true });

const { rows } = await db.execute(
  `SELECT id, name, image FROM "user" WHERE image IS NOT NULL AND image != '' ORDER BY name`,
);

function decode(image: string): Buffer {
  if (image.startsWith("data:")) return Buffer.from(image.slice(image.indexOf(",") + 1), "base64");
  return readFileSync(join(WEB_PUBLIC, image));
}

// ── Preview pieces ─────────────────────────────────────────────────────

const EMBER_BG = "#1d1a17";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** The original at 256px with the fitted circle in red. */
async function overlay(src: Buffer, c: BadgeCircle | null, scale: number): Promise<Buffer> {
  const base = await sharp(src).resize(AVATAR_PX, AVATAR_PX).png().toBuffer();
  if (!c) return base;
  const s = AVATAR_PX / scale;
  const ring = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${AVATAR_PX}" height="${AVATAR_PX}"><circle cx="${(c.cx + 0.5) * s}" cy="${(c.cy + 0.5) * s}" r="${c.r * s}" fill="none" stroke="#ff2a2a" stroke-width="1"/></svg>`,
  );
  return sharp(base)
    .composite([{ input: ring }])
    .png()
    .toBuffer();
}

/** As the app shows it: a 96px circle with the 2px offset and accent ring. */
async function inApp(img: Buffer): Promise<Buffer> {
  const D = 96;
  const B = D + 16;
  const clip = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${D}" height="${D}"><circle cx="${D / 2}" cy="${D / 2}" r="${D / 2}" fill="#fff"/></svg>`,
  );
  const face = await sharp(img)
    .resize(D, D)
    .composite([{ input: clip, blend: "dest-in" }])
    .png()
    .toBuffer();
  const ring = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${B}" height="${B}"><circle cx="${B / 2}" cy="${B / 2}" r="${D / 2 + 3}" fill="none" stroke="#c89b5e" stroke-opacity="0.6" stroke-width="2"/></svg>`,
  );
  return sharp({ create: { width: B, height: B, channels: 4, background: EMBER_BG } })
    .composite([
      { input: face, left: 8, top: 8 },
      { input: ring, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

/** The top edge, 3× — where heads and rims get clipped. */
async function topZoom(img: Buffer): Promise<Buffer> {
  const app = await inApp(img);
  return sharp(app)
    .extract({ left: 16, top: 0, width: 80, height: 40 })
    .resize(240, 120, { kernel: "nearest" })
    .png()
    .toBuffer();
}

type Row = {
  id: string;
  name: string;
  verdict: "centre" | "already flush" | "skip – no circle";
  circle: BadgeCircle | null;
  scale: number;
  old: string;
  next: Buffer | null;
  tiles: Buffer[];
};

const results: Row[] = [];
for (const r of rows) {
  const id = String(r.id);
  if (only.size > 0 && !only.has(id)) continue;
  const name = String(r.name);
  const old = String(r.image);
  const stored = decode(old);
  const srcPath = sources.get(id);
  const src = srcPath ? readFileSync(srcPath) : stored;
  const rgba = await toRgba(src);
  const circle = findBadgeCircle(rgba);
  const verdict = !circle ? "skip – no circle" : circle.flush ? "already flush" : "centre";
  const oval = circle && ovals.has(id) ? fitBadgeOval(rgba, circle) : null;
  if (ovals.has(id))
    console.log(
      `  oval: ${oval ? `${oval.rx.toFixed(1)} × ${oval.ry.toFixed(1)}, rms ${oval.rms.toFixed(2)}` : "no fit"}`,
    );
  const inset = (insets.get(id) ?? 0) * (rgba.width / AVATAR_PX);
  const shape = oval
    ? { ...oval, rx: oval.rx - inset, ry: oval.ry - inset }
    : circle && { ...circle, r: circle.r - inset };
  const next = verdict === "centre" && shape ? await centreBadge(src, shape) : null;
  const tiles = [
    await overlay(src, circle, rgba.width),
    await inApp(stored),
    await inApp(next ?? stored),
    await topZoom(stored),
    await topZoom(next ?? stored),
  ];
  results.push({ id, name, verdict, circle, scale: rgba.width, old, next, tiles });
  const c = circle;
  console.log(
    `${name.padEnd(22)} ${verdict.padEnd(17)}`,
    c
      ? `centre Δ ${(c.cx + 0.5 - rgba.width / 2).toFixed(1)},${(c.cy + 0.5 - rgba.height / 2).toFixed(1)}px  r ${c.r.toFixed(1)}/${rgba.width / 2}  scale ×${(rgba.width / 2 / c.r).toFixed(3)}  inliers ${(c.inlierShare * 100).toFixed(0)}%  rms ${c.rms.toFixed(2)}  spill ${c.spillPct.toFixed(2)}%`
      : "",
  );
  if (next) writeFileSync(join(out, `${id}.webp`), next);
}

// ── Contact sheets (5 members each) ────────────────────────────────────

const ROW_H = 270;
const COLS = [0, 270, 400, 530, 790];
const W = 1040;
const LABEL_H = 0;
for (let page = 0; page * 5 < results.length; page++) {
  const slice = results.slice(page * 5, page * 5 + 5);
  const comps: sharp.OverlayOptions[] = [];
  slice.forEach((row, i) => {
    const y = i * ROW_H + LABEL_H + 6;
    row.tiles.forEach((t, j) => {
      comps.push({ input: t, left: COLS[j] + 6, top: y + (j === 0 ? 0 : j <= 2 ? 30 : 30) });
    });
    const c = row.circle;
    const line = c
      ? `${row.verdict} · shift ${(c.cx + 0.5 - row.scale / 2).toFixed(1)}, ${(c.cy + 0.5 - row.scale / 2).toFixed(1)} px · ×${(row.scale / 2 / c.r).toFixed(3)} · spill ${c.spillPct.toFixed(1)}%`
      : row.verdict;
    comps.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="28"><text x="0" y="18" font-family="sans-serif" font-size="15" fill="#eee">${esc(row.name)} — ${esc(line)}</text></svg>`,
      ),
      left: 276,
      top: y,
    });
  });
  comps.push({
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="20"><text x="282" y="15" font-family="sans-serif" font-size="12" fill="#999">before · after (in app)          top edge ×3: before · after</text></svg>`,
    ),
    left: 0,
    top: slice.length * ROW_H,
  });
  await sharp({
    create: { width: W, height: slice.length * ROW_H + 24, channels: 3, background: EMBER_BG },
  })
    .composite(comps)
    .png()
    .toFile(join(out, `sheet-${page + 1}.png`));
}
console.log(`previews → ${out}`);

// ── Apply ──────────────────────────────────────────────────────────────

if (apply) {
  const backup = Object.fromEntries(rows.map((r) => [String(r.id), String(r.image)]));
  const file = join(out, `backup-before-recentre-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(backup));
  console.log("backup →", file);
  for (const row of results) {
    if (!row.next) continue;
    const uri = `data:image/webp;base64,${row.next.toString("base64")}`;
    const res = await db.execute({
      sql: `UPDATE "user" SET image = ? WHERE id = ? AND image = ?`,
      args: [uri, row.id, row.old],
    });
    if (res.rowsAffected !== 1) {
      console.log("SKIPPED (changed meanwhile)", row.name);
      continue;
    }
    const back = await db.execute({ sql: `SELECT image FROM "user" WHERE id = ?`, args: [row.id] });
    const img = await toRgba(decode(String(back.rows[0]?.image)));
    const c = findBadgeCircle(img);
    const corner = img.data[3];
    const ok =
      c !== null &&
      Math.hypot(c.cx + 0.5 - 128, c.cy + 0.5 - 128) < 0.5 &&
      Math.abs(c.r - 128) < 0.75 &&
      corner === 0;
    console.log(
      ok ? "ok  " : "CHECK",
      row.name,
      c
        ? `centre ${(c.cx + 0.5).toFixed(2)},${(c.cy + 0.5).toFixed(2)} r ${c.r.toFixed(2)}`
        : "no circle",
    );
  }
}
