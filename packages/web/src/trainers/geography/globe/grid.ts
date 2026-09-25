import { type GeoProjection, geoDistance, geoGraticule, geoPath } from "d3-geo";
import type { LonLat } from "./geo";
import type { GlobePalette } from "./palette";

// The orientation grid: meridians and parallels drawn over land and sea,
// their spacing chosen from the zoom so lines stay roughly TARGET_PX apart
// (30° for the whole Earth, down to a quarter degree up close), every few
// lines a stronger one, and each line labelled in degrees along the bottom
// and left of the view. Only the visible part of the globe is generated.

const STEPS = [30, 20, 10, 5, 2, 1, 0.5, 0.25] as const;
const TARGET_PX = 90;

/** The grid step for a globe of radius `r` px: the finest that keeps lines ≥ TARGET_PX apart. */
export function gridStep(r: number): number {
  const pxPerDeg = (r * Math.PI) / 180;
  let pick: number = STEPS[0];
  for (const s of STEPS) if (s * pxPerDeg >= TARGET_PX) pick = s;
  return pick;
}

/** A coarser step for the stronger lines (none when the grid is already coarse). */
export function majorStep(step: number): number | null {
  if (step >= 10) return null;
  if (step >= 2) return 10;
  if (step >= 0.5) return 5;
  return 1;
}

export function formatDeg(v: number, axis: "lon" | "lat", step: number): string {
  let x = v;
  if (axis === "lon") x = ((((x + 180) % 360) + 360) % 360) - 180;
  const digits = step < 0.5 ? 2 : step < 1 ? 1 : 0;
  const abs = Math.abs(x);
  const text = digits ? abs.toFixed(digits).replace(/\.?0+$/, "") : String(Math.round(abs));
  if (Math.abs(x) < 1e-9 || (axis === "lon" && Math.abs(abs - 180) < 1e-9)) return `${text}°`;
  const hemi = axis === "lon" ? (x > 0 ? "E" : "W") : x > 0 ? "N" : "S";
  return `${text}°${hemi}`;
}

const snapDown = (v: number, s: number) => Math.floor(v / s) * s;
const snapUp = (v: number, s: number) => Math.ceil(v / s) * s;

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  projection: GeoProjection,
  o: { w: number; h: number; r: number; center: LonLat; cap: number; pal: GlobePalette },
): void {
  const { w, h, r, center, pal } = o;
  const step = gridStep(r);
  const capDeg = Math.min(90, (o.cap * 180) / Math.PI);
  const [clon, clat] = center;
  const latMin = Math.max(-90, snapDown(clat - capDeg, step));
  const latMax = Math.min(90, snapUp(clat + capDeg, step));
  const polar = latMax >= 89.9 || latMin <= -89.9;
  const coslat = Math.cos((Math.max(Math.abs(latMin), Math.abs(latMax)) * Math.PI) / 180);
  const half = polar ? 180 : Math.min(180, capDeg / Math.max(coslat, 1e-3));
  const lonMin = polar ? -180 : snapDown(clon - half, step);
  const lonMax = polar ? 180 : snapUp(clon + half, step);
  const extent: [[number, number], [number, number]] = [
    [lonMin, latMin],
    [lonMax, latMax],
  ];
  const path = geoPath(projection, ctx);

  const lines = (s: number, stroke: string, width: number) => {
    const g = geoGraticule()
      .extent(extent)
      .step([s, s])
      .precision(Math.min(2.5, s / 4));
    ctx.beginPath();
    path(g());
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  lines(step, pal.gridMinor, 0.6);
  const major = majorStep(step);
  if (major) lines(major, pal.gridMajor, 0.9);

  // Labels: meridians along the bottom of the view, parallels along the left.
  const invert = projection.invert?.bind(projection);
  const bottom = invert?.([w / 2, h - 12]);
  const onSphere = (p: number[] | null | undefined): p is [number, number] =>
    !!p && Number.isFinite(p[0]) && geoDistance(center, [p[0], p[1]]) < Math.PI / 2 - 0.02;
  const labelLat = onSphere(bottom) ? bottom[1] : clat - capDeg * 0.8;
  const left = invert?.([26, h / 2]);
  // Off the sphere (the whole Earth in view): just inside the left limb.
  const labelLon = onSphere(left) ? left[0] : clon - Math.min(half, capDeg) * 0.8;

  ctx.font = `600 10px ${pal.font}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = pal.water;
  ctx.fillStyle = pal.gridLabel;
  const drawn: { x: number; y: number }[] = [];
  const label = (at: LonLat, text: string, align: CanvasTextAlign, dx: number, dy: number) => {
    if (geoDistance(center, at) > Math.PI / 2 - 0.05) return;
    const p = projection(at);
    if (!p) return;
    const x = p[0] + dx;
    const y = p[1] + dy;
    // Only where the line really is: a label clamped onto the edge would lie.
    if (x < 6 || x > w - 6 || y < 10 || y > h - 6) return;
    if (drawn.some((d) => Math.abs(d.x - x) < 34 && Math.abs(d.y - y) < 12)) return;
    drawn.push({ x, y });
    ctx.textAlign = align;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  };
  ctx.textBaseline = "middle";
  for (let lon = lonMin; lon <= lonMax + 1e-9; lon += step) {
    if (polar && lon >= 180) break;
    label([lon, labelLat], formatDeg(lon, "lon", step), "center", 0, -8);
  }
  for (let lat = latMin; lat <= latMax + 1e-9; lat += step) {
    if (Math.abs(lat) > 89.9) continue;
    label([labelLon, lat], formatDeg(lat, "lat", step), "left", 4, -6);
  }
  ctx.textAlign = "start";
}
