// Round-badge avatars, centred and flush with their frame.
//
// The generated avatars are a round badge drawn on a square (cream, white,
// black or transparent). The app clips every avatar to the circle inscribed
// in the square, so a badge that sits off-centre or a little small shows a
// sliver of the square's background inside the frame. This finds the badge's
// OUTER circle (its rim included) and re-frames the picture so that circle
// is exactly the frame: centred, edge to edge, everything outside it
// transparent. Nothing inside the badge is cut — pixels only move and scale.
//
// Detection (`findBadgeCircle`, pure):
//  1. Background = the four corners' median colour (or "transparent" when the
//     corners are). Corners that disagree mean full-bleed art: no badge.
//  2. 720 rays from the image border inward; each records the first point
//     that leaves the background — the badge's outermost edge, rim included.
//  3. RANSAC over those points picks the circle most of them sit on (props
//     poking out of the badge are outliers), then Gauss–Newton refines it.
//  4. Accepted only when most rays agree, the fit is tight and the radius is
//     plausible; otherwise null (not a badge — leave the picture alone).

import sharp from "sharp";

export type Rgba = { data: Uint8Array | Buffer; width: number; height: number };

export type BadgeCircle = {
  cx: number;
  cy: number;
  r: number;
  /** Share of the cast rays whose edge point lies on the circle. */
  inlierShare: number;
  /** Root-mean-square distance of the inliers from the circle, px. */
  rms: number;
  /** Non-background pixels outside the circle, % of the image — what re-framing drops. */
  spillPct: number;
  /** Already centred and edge to edge: nothing to do. */
  flush: boolean;
};

const RAYS = 720;
const OPAQUE_DIFF = 18;
const INLIER_PX = 1.5;
// Ragged hand-painted rims and props over the edge leave many rays off the
// circle; 40% on a tight fit still only accepts real badges.
const MIN_INLIER_SHARE = 0.4;
const MAX_RMS = 1.2;
const FLUSH_PX = 0.75;

type Bg = { transparent: true } | { transparent: false; rgb: [number, number, number] };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

function background({ data, width, height }: Rgba): Bg | null {
  const patch = 6;
  const corners: [number, number][] = [
    [0, 0],
    [width - patch, 0],
    [0, height - patch],
    [width - patch, height - patch],
  ];
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const a: number[] = [];
  const perCorner: [number, number, number, number][] = [];
  for (const [x0, y0] of corners) {
    const cr: number[] = [];
    const cg: number[] = [];
    const cb: number[] = [];
    const ca: number[] = [];
    for (let y = y0; y < y0 + patch; y++) {
      for (let x = x0; x < x0 + patch; x++) {
        const i = (y * width + x) * 4;
        cr.push(data[i]);
        cg.push(data[i + 1]);
        cb.push(data[i + 2]);
        ca.push(data[i + 3]);
      }
    }
    perCorner.push([median(cr), median(cg), median(cb), median(ca)]);
    r.push(...cr);
    g.push(...cg);
    b.push(...cb);
    a.push(...ca);
  }
  if (perCorner.every((c) => c[3] < 40)) return { transparent: true };
  if (perCorner.some((c) => c[3] < 200)) return null;
  for (let ch = 0; ch < 3; ch++) {
    const vals = perCorner.map((c) => c[ch]);
    if (Math.max(...vals) - Math.min(...vals) > 10) return null;
  }
  return { transparent: false, rgb: [median(r), median(g), median(b)] };
}

/** 0..1 — how far a pixel is from the background (1 = clearly not background). */
function foreground(img: Rgba, bg: Bg, x: number, y: number): boolean {
  const xi = Math.min(img.width - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(img.height - 1, Math.max(0, Math.round(y)));
  const i = (yi * img.width + xi) * 4;
  const d = img.data;
  if (bg.transparent) return d[i + 3] > 128;
  if (d[i + 3] < 128) return false;
  return (
    Math.max(
      Math.abs(d[i] - bg.rgb[0]),
      Math.abs(d[i + 1] - bg.rgb[1]),
      Math.abs(d[i + 2] - bg.rgb[2]),
    ) > OPAQUE_DIFF
  );
}

/** Seeded so the same picture always gives the same circle. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export type Pt = [number, number];
type Circle = { cx: number; cy: number; r: number };

function circleFrom3([x1, y1]: Pt, [x2, y2]: Pt, [x3, y3]: Pt): Circle | null {
  const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(d) < 1e-6) return null;
  const s1 = x1 * x1 + y1 * y1;
  const s2 = x2 * x2 + y2 * y2;
  const s3 = x3 * x3 + y3 * y3;
  const cx = (s1 * (y2 - y3) + s2 * (y3 - y1) + s3 * (y1 - y2)) / d;
  const cy = (s1 * (x3 - x2) + s2 * (x1 - x3) + s3 * (x2 - x1)) / d;
  return { cx, cy, r: Math.hypot(x1 - cx, y1 - cy) };
}

const residual = (c: Circle, [x, y]: Pt) => Math.hypot(x - c.cx, y - c.cy) - c.r;

/** Geometric least squares (Gauss–Newton on cx, cy, r). */
function refine(c0: Circle, pts: Pt[]): Circle {
  let { cx, cy, r } = c0;
  for (let it = 0; it < 20; it++) {
    // Normal equations JᵀJ·δ = −Jᵀf for f_i = |p_i − c| − r.
    const A = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const v = [0, 0, 0];
    for (const [x, y] of pts) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy) || 1e-9;
      const j = [-dx / dist, -dy / dist, -1];
      const f = dist - r;
      for (let a = 0; a < 3; a++) {
        v[a] -= j[a] * f;
        for (let b = 0; b < 3; b++) A[a][b] += j[a] * j[b];
      }
    }
    const delta = solve3(A, v);
    if (!delta) break;
    cx += delta[0];
    cy += delta[1];
    r += delta[2];
    if (Math.hypot(delta[0], delta[1], delta[2]) < 1e-4) break;
  }
  return { cx, cy, r };
}

function solve3(A: number[][], v: number[]): number[] | null {
  const m = A.map((row, i) => [...row, v[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const k = m[r][c] / m[c][c];
      for (let k2 = c; k2 < 4; k2++) m[r][k2] -= k * m[c][k2];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

/** The badge's outer circle, or null when the picture isn't a round badge. */
export function findBadgeCircle(img: Rgba): BadgeCircle | null {
  const res = fitBadge(img);
  return "reason" in res ? null : res;
}

/**
 * The badge's outermost edge: one point per ray cast from the image border
 * toward the badge, where the colour first leaves the background.
 */
export function badgeEdge(img: Rgba): { pts: Pt[] } | { reason: string } {
  const { width: W, height: H } = img;
  const bg = background(img);
  if (!bg) return { reason: "no plain background in the corners" };

  // Rough centre: centroid of everything that isn't background.
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (foreground(img, bg, x, y)) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  if (n < W * H * 0.2) return { reason: "almost nothing but background" };
  const ox = sx / n;
  const oy = sy / n;

  // Edge points: border → centre along each ray; first step onto the badge.
  const pts: Pt[] = [];
  const step = 0.25;
  for (let k = 0; k < RAYS; k++) {
    const t = (k / RAYS) * 2 * Math.PI;
    const dx = Math.cos(t);
    const dy = Math.sin(t);
    // Distance from the rough centre to the image border along this ray.
    const tx = dx > 0 ? (W - 1 - ox) / dx : dx < 0 ? -ox / dx : Number.POSITIVE_INFINITY;
    const ty = dy > 0 ? (H - 1 - oy) / dy : dy < 0 ? -oy / dy : Number.POSITIVE_INFINITY;
    const tmax = Math.min(tx, ty);
    if (foreground(img, bg, ox + dx * tmax, oy + dy * tmax)) continue; // badge touches the border here
    for (let s = tmax; s > 0; s -= step) {
      if (foreground(img, bg, ox + dx * s, oy + dy * s)) {
        // Half a step back: midway between the last background and first badge sample.
        const e = s + step / 2;
        pts.push([ox + dx * e, oy + dy * e]);
        break;
      }
    }
  }
  return { pts };
}

/** As `findBadgeCircle`, but says why a picture was turned down. */
export function fitBadge(img: Rgba): BadgeCircle | { reason: string } {
  const { width: W, height: H } = img;
  // Tolerances are tuned at 256px; a bigger original gets proportionally more.
  const tol = INLIER_PX * Math.max(1, W / 256);
  const bg = background(img);
  const edge = badgeEdge(img);
  if (!bg || "reason" in edge) return "reason" in edge ? edge : { reason: "no background" };
  const { pts } = edge;
  if (pts.length < RAYS * MIN_INLIER_SHARE)
    return { reason: `only ${pts.length}/${RAYS} rays found an edge` };

  // RANSAC.
  const rand = lcg(W * 7919 + H);
  let best: { c: Circle; count: number } | null = null;
  for (let it = 0; it < 300; it++) {
    const pick = () => pts[Math.floor(rand() * pts.length)];
    const c = circleFrom3(pick(), pick(), pick());
    if (!c || c.r < W * 0.3 || c.r > W * 0.6) continue;
    let count = 0;
    for (const p of pts) if (Math.abs(residual(c, p)) < tol) count++;
    if (!best || count > best.count) best = { c, count };
  }
  if (!best) return { reason: "no candidate circle" };

  let circle = best.c;
  let inliers: Pt[] = pts;
  for (let pass = 0; pass < 3; pass++) {
    inliers = pts.filter((p) => Math.abs(residual(circle, p)) < tol);
    if (inliers.length < 3) return { reason: "fit collapsed" };
    circle = refine(circle, inliers);
  }
  inliers = pts.filter((p) => Math.abs(residual(circle, p)) < tol);
  const rms = Math.sqrt(inliers.reduce((a, p) => a + residual(circle, p) ** 2, 0) / inliers.length);
  const inlierShare = inliers.length / RAYS;
  if (inlierShare < MIN_INLIER_SHARE || rms > MAX_RMS * Math.max(1, W / 256))
    return {
      reason: `loose fit: ${(inlierShare * 100).toFixed(0)}% inliers, rms ${rms.toFixed(2)} (r ${circle.r.toFixed(1)} at ${circle.cx.toFixed(1)},${circle.cy.toFixed(1)})`,
    };
  if (circle.r < W * 0.35 || circle.r > W * 0.55)
    return { reason: `radius ${circle.r.toFixed(1)} out of range` };

  let spill = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (Math.hypot(x - circle.cx, y - circle.cy) > circle.r + tol && foreground(img, bg, x, y))
        spill++;
    }
  }
  const half = W / 2;
  const flush =
    Math.hypot(circle.cx + 0.5 - half, circle.cy + 0.5 - H / 2) < FLUSH_PX &&
    Math.abs(circle.r - half) < FLUSH_PX;
  return {
    ...circle,
    inlierShare,
    rms,
    spillPct: (spill / (W * H)) * 100,
    flush,
  };
}

export type BadgeOval = { cx: number; cy: number; rx: number; ry: number; rms: number };

/**
 * For a badge drawn a little out of round: the axis-aligned ellipse through
 * its edge, seeded by the circle fit. Edge points within a few px of the
 * circle are fitted algebraically (A·x² + B·y² + C·x + D·y = 1), then
 * trimmed to the ones near the ellipse and refitted, so props over the edge
 * don't pull it.
 */
export function fitBadgeOval(img: Rgba, circle: BadgeCircle): BadgeOval | null {
  const edge = badgeEdge(img);
  if ("reason" in edge) return null;
  const scale = Math.max(1, img.width / 256);
  const near = (cx: number, cy: number, rx: number, ry: number, lim: number) =>
    edge.pts.filter(([x, y]) => {
      const d = (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * ((rx + ry) / 2);
      return Math.abs(d) < lim;
    });
  let oval: BadgeOval | null = null;
  let pts = near(circle.cx, circle.cy, circle.r, circle.r, 8 * scale);
  for (let pass = 0; pass < 4; pass++) {
    if (pts.length < 20) return null;
    // Normal equations for [A, B, C, D] with target 1, centred for conditioning.
    const mx = circle.cx;
    const my = circle.cy;
    const M = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    const v = [0, 0, 0, 0];
    for (const [x0, y0] of pts) {
      const x = x0 - mx;
      const y = y0 - my;
      const row = [x * x, y * y, x, y];
      for (let i = 0; i < 4; i++) {
        v[i] += row[i];
        for (let j = 0; j < 4; j++) M[i][j] += row[i] * row[j];
      }
    }
    const sol = solveN(M, v);
    if (!sol) return null;
    const [A, B, C, D] = sol;
    if (A <= 0 || B <= 0) return null;
    const cx = mx - C / (2 * A);
    const cy = my - D / (2 * B);
    const k = 1 + (C * C) / (4 * A) + (D * D) / (4 * B);
    const rx = Math.sqrt(k / A);
    const ry = Math.sqrt(k / B);
    const res = pts.map(
      ([x, y]) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * ((rx + ry) / 2),
    );
    oval = { cx, cy, rx, ry, rms: Math.sqrt(res.reduce((a, d) => a + d * d, 0) / res.length) };
    pts = near(cx, cy, rx, ry, INLIER_PX * scale);
  }
  return oval;
}

function solveN(A: number[][], v: number[]): number[] | null {
  const n = v.length;
  const m = A.map((row, i) => [...row, v[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / m[i][i]);
}

/** Decode any image into RGBA for `findBadgeCircle`. */
export async function toRgba(buf: Buffer): Promise<Rgba> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export const AVATAR_PX = 256;

/**
 * Re-frame `buf` so `circle` becomes the frame: its centre at the middle, its
 * edge touching the sides, everything outside it transparent. Returns WebP.
 * Pixel centres sit at +0.5, so a circle measured in pixel indices maps to
 * the square [cx + 0.5 − r, cy + 0.5 − r] of side 2r.
 */
export async function centreBadge(
  buf: Buffer,
  circle: Pick<BadgeCircle, "cx" | "cy" | "r"> | BadgeOval,
  size = AVATAR_PX,
): Promise<Buffer> {
  // An oval badge (`fitBadgeOval`) is stretched onto the frame circle: its
  // bounding box becomes the square.
  const rx = "rx" in circle ? circle.rx : circle.r;
  const ry = "ry" in circle ? circle.ry : circle.r;
  const meta = await sharp(buf).metadata();
  const W = meta.width ?? 0;
  // Small sources are upscaled first so the crop lands within a quarter pixel.
  const k = Math.max(1, Math.ceil(1024 / W));
  const pad = Math.ceil(Math.max(rx, ry)) + 2;
  const padded = await sharp(buf)
    .ensureAlpha()
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const pm = await sharp(padded).metadata();
  const big =
    k === 1
      ? padded
      : await sharp(padded)
          .resize((pm.width ?? 0) * k, (pm.height ?? 0) * k, { kernel: "lanczos3" })
          .png()
          .toBuffer();
  const width = Math.round(2 * rx * k);
  const height = Math.round(2 * ry * k);
  const left = Math.round((circle.cx + 0.5 - rx + pad) * k);
  const top = Math.round((circle.cy + 0.5 - ry + pad) * k);
  const cropped = await sharp(big)
    .extract({ left, top, width, height })
    .resize(size, size, { kernel: "lanczos3", fit: "fill" })
    .png()
    .toBuffer();
  const c = size / 2;
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${c}" cy="${c}" r="${c - 0.5}" fill="#fff"/></svg>`,
  );
  return sharp(cropped)
    .composite([{ input: mask, blend: "dest-in" }])
    .webp({ quality: 90, alphaQuality: 100 })
    .toBuffer();
}
