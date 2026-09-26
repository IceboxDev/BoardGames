import { geoDistance, geoInterpolate, geoOrthographic, geoPath } from "d3-geo";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { cn } from "../../../lib/cn";
import { type LonLat, meridianBand } from "./geo";
import { GlobeGL, type Split } from "./gl";
import { drawGrid } from "./grid";
import { type GlobePalette, readPalette, type Tone, toRgb, useThemeVersion } from "./palette";
import { makeView, traceBorders, traceGeom } from "./render";
import type { World } from "./world";

// The unmarked globe: land and water on an orthographic projection, drawn on
// a canvas (smooth to drag on a phone; no DOM node per country). Everything
// on it is declarative — fills, outlines, borders, markers, arcs — and a
// `focus` with a new key flies the camera there. Drag to turn, wheel or
// pinch to zoom, arrows / +/− from the keyboard; a click that did not drag
// reports the point under it through `onPick`.

export interface GlobeFill {
  feature: string;
  tone: Tone;
  alpha?: number;
  clip?: { lon: number; side: "west" | "east" } | null;
}

export interface GlobeMarker {
  at: LonLat;
  tone: Tone;
  /** Radius in CSS px. */
  size?: number;
  /** A hollow ring instead of a dot (the learner's pin). */
  ring?: boolean;
  pulse?: boolean;
  label?: string;
}

export interface GlobeScene {
  fills?: readonly GlobeFill[];
  outlines?: readonly { feature: string; tone: Tone; width?: number }[];
  /** Draw every land border (the hint / the reveal). */
  borders?: boolean;
  /** The orientation grid (the borderless stages, where it replaces the borders). */
  grid?: boolean;
  markers?: readonly GlobeMarker[];
  arcs?: readonly { from: LonLat; to: LonLat; tone: Tone }[];
}

export interface GlobeFocus {
  at: LonLat;
  zoom: number;
  /** A new key re-flies even to the same spot. */
  key: string | number;
}

type Props = {
  world: World;
  scene?: GlobeScene;
  focus?: GlobeFocus | null;
  /** Where the camera starts (no flight). */
  initial?: { at: LonLat; zoom: number };
  onPick?: (at: LonLat) => void;
  /** Reports the view after it settles (so a session can keep it across cards). */
  onViewChange?: (view: { at: LonLat; zoom: number }) => void;
  /** Turn slowly while nobody touches it (the hub). */
  spin?: boolean;
  interactive?: boolean;
  className?: string;
  "aria-label": string;
};

const MIN_ZOOM = 0.9;
const MAX_ZOOM = 28;
const CLICK_SLOP = 5;
const FLIGHT_MS = 1100;
const SPIN_DEG_PER_S = 4;
const IDLE_HI_MS = 140;
/** Beyond this point level the light mesh is coarser than a pixel: use the full one. */
const LITE_LEVEL = 20;

interface Camera {
  /** d3 rotate: [−lon, −lat] of the centre. */
  lambda: number;
  phi: number;
  zoom: number;
}

interface Flight {
  from: LonLat;
  to: LonLat;
  z0: number;
  z1: number;
  start: number;
  ms: number;
}

/**
 * The globe's radius at zoom 1. A tall phone screen would leave the
 * width-bound globe floating in empty space: there it grows past the sides
 * (a little of the far limbs cropped) to use the height.
 */
function baseRadius(w: number, h: number): number {
  const fit = Math.min(w, h) / 2 - 6;
  return h > w * 1.25 ? Math.max(fit, Math.min(w * 0.7, h / 2 - 6)) : fit;
}

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const center = (c: Camera): LonLat => [-c.lambda, -c.phi];
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function Globe({
  world,
  scene,
  focus,
  initial,
  onPick,
  onViewChange,
  spin = false,
  interactive = true,
  className,
  "aria-label": ariaLabel,
}: Props) {
  /** The top layer: lines, markers, input. */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** The bottom layer: water. */
  const backRef = useRef<HTMLCanvasElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<GlobeGL | null>(null);
  const colorsFor = useRef<{ scene: unknown; key: string; splits: Split[] }>({
    scene: null,
    key: "",
    splits: [],
  });
  const themeKey = useRef(0);
  const camera = useRef<Camera>({
    lambda: -(initial?.at[0] ?? 10),
    phi: -(initial?.at[1] ?? 30),
    zoom: initial?.zoom ?? 1,
  });
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const flight = useRef<Flight | null>(null);
  const moving = useRef(false);
  const lastMove = useRef(0);
  const lastTouch = useRef(0);
  const frame = useRef<number | null>(null);
  const palette = useRef<GlobePalette | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const spinRef = useRef(spin);
  spinRef.current = spin;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onViewRef = useRef(onViewChange);
  onViewRef.current = onViewChange;
  const themeVersion = useThemeVersion();

  // ── Drawing ──────────────────────────────────────────────────────────

  const draw = useCallback(
    (now: number) => {
      const front = canvasRef.current;
      const back = backRef.current;
      if (!front || !back) return;
      const ctx = front.getContext("2d");
      const bctx = back.getContext("2d");
      const { w, h, dpr } = size.current;
      if (!ctx || !bctx || w === 0 || h === 0) return;
      palette.current ??= readPalette(front);
      const pal = palette.current;
      const cam = camera.current;
      const radius = baseRadius(w, h) * cam.zoom;
      const projection = geoOrthographic()
        .rotate([cam.lambda, cam.phi])
        .scale(radius)
        .translate([w / 2, h / 2])
        .clipAngle(90)
        .precision(0.5);
      const s = sceneRef.current ?? {};
      const c0 = center(cam);
      const lod = world.lod();
      const view = makeView(w, h, radius, cam.lambda, cam.phi);

      // ── Back: water ──
      const bpath = geoPath(projection, bctx);
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const glow = bctx.createRadialGradient(
        cx - radius * 0.35,
        cy - radius * 0.4,
        radius * 0.1,
        cx,
        cy,
        radius,
      );
      glow.addColorStop(0, pal.waterLit);
      glow.addColorStop(1, pal.water);
      bctx.beginPath();
      bpath({ type: "Sphere" });
      bctx.fillStyle = glow;
      bctx.fill();
      // A breath of blue, so water never reads as dark land.
      bctx.globalAlpha = 0.07;
      bctx.fillStyle = pal.tone.accent;
      bctx.fill();
      bctx.globalAlpha = 1;

      // ── Middle: land on the GPU (or on the back canvas without WebGL) ──
      const gl = glRef.current;
      if (gl) {
        const key = `${lod.ids.length}|${themeKey.current}`;
        if (colorsFor.current.scene !== s.fills || colorsFor.current.key !== key) {
          const table = colorTable(lod.ids, s.fills ?? [], pal);
          gl.setColors(table.rgba, lod.ids.length);
          colorsFor.current = { scene: s.fills, key, splits: table.splits };
        }
        const mesh =
          (view.maxLevel > LITE_LEVEL ? world.mesh("full") : undefined) ?? world.mesh("lite");
        if (mesh) {
          gl.draw({
            mesh,
            w,
            h,
            dpr,
            r: radius,
            lambda: cam.lambda,
            phi: cam.phi,
            splits: colorsFor.current.splits,
          });
        }
      } else {
        bctx.beginPath();
        for (const g of lod.geoms) traceGeom(bctx, lod, g, view);
        bctx.fillStyle = pal.land;
        bctx.fill("evenodd");
        for (const f of s.fills ?? []) {
          const g = world.geom(f.feature);
          if (!g) continue;
          bctx.save();
          if (f.clip) {
            bctx.beginPath();
            bpath(meridianBand(f.clip.lon, f.clip.side));
            bctx.clip();
          }
          bctx.beginPath();
          traceGeom(bctx, lod, g, view);
          bctx.globalAlpha = f.alpha ?? 1;
          bctx.fillStyle = pal.tone[f.tone];
          bctx.fill("evenodd");
          bctx.restore();
        }
      }

      // ── Front: lines, markers, the rim ──
      const path = geoPath(projection, ctx);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // The orientation grid, over land and sea, finer as the globe zooms in —
      // only where the borders are off.
      if (s.grid) drawGrid(ctx, projection, { w, h, r: radius, center: c0, cap: view.cap, pal });

      if (s.borders) {
        ctx.beginPath();
        traceBorders(ctx, lod, view);
        ctx.strokeStyle = pal.border;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      for (const o of s.outlines ?? []) {
        const g = world.geom(o.feature);
        if (!g) continue;
        ctx.beginPath();
        traceGeom(ctx, lod, g, view);
        ctx.strokeStyle = pal.tone[o.tone];
        ctx.lineWidth = o.width ?? 1.6;
        ctx.stroke();
      }

      for (const a of s.arcs ?? []) {
        ctx.beginPath();
        path({ type: "LineString", coordinates: [a.from, a.to] });
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = pal.tone[a.tone];
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Markers on the near side only.
      const pulse = (Math.sin(now / 260) + 1) / 2;
      for (const m of s.markers ?? []) {
        if (geoDistance(c0, m.at) > Math.PI / 2 - 0.01) continue;
        const p = projection(m.at);
        if (!p) continue;
        const r = m.size ?? 4;
        if (m.pulse) {
          ctx.beginPath();
          ctx.arc(p[0], p[1], r + 3 + pulse * 7, 0, Math.PI * 2);
          ctx.globalAlpha = 0.45 * (1 - pulse);
          ctx.fillStyle = pal.tone[m.tone];
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
        if (m.ring) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = pal.tone[m.tone];
          ctx.stroke();
        } else {
          ctx.fillStyle = pal.tone[m.tone];
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = pal.water;
          ctx.stroke();
        }
        if (m.label) {
          ctx.font = `600 12px ${pal.font}`;
          ctx.textBaseline = "middle";
          ctx.lineWidth = 3;
          ctx.strokeStyle = pal.water;
          ctx.strokeText(m.label, p[0] + r + 5, p[1]);
          ctx.fillStyle = pal.label;
          ctx.fillText(m.label, p[0] + r + 5, p[1]);
        }
      }

      // Rim.
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.strokeStyle = pal.rim;
      ctx.lineWidth = 1;
      ctx.stroke();
    },
    [world],
  );

  // ── The frame loop: runs while something moves, then stops ────────────

  const tick = useCallback(
    (now: number) => {
      frame.current = null;
      const cam = camera.current;
      let again = false;
      const f = flight.current;
      if (f) {
        const t = Math.min(1, (now - f.start) / f.ms);
        const k = ease(t);
        const at = geoInterpolate(f.from, f.to)(k);
        // Long flights pull back a little mid-way, like a camera would.
        const far = Math.min(1, geoDistance(f.from, f.to) / (Math.PI / 2));
        const dip = 1 - 0.45 * far * Math.sin(Math.PI * t);
        cam.lambda = -at[0];
        cam.phi = -at[1];
        cam.zoom = clampZoom((f.z0 + (f.z1 - f.z0) * k) * dip);
        lastMove.current = now;
        if (t < 1) again = true;
        else {
          flight.current = null;
          onViewRef.current?.({ at: center(cam), zoom: cam.zoom });
        }
      } else if (spinRef.current && !moving.current && now - lastTouch.current > 4000) {
        cam.lambda += (SPIN_DEG_PER_S * 16) / 1000;
        lastMove.current = now;
        again = true;
      }
      const hasPulse = (sceneRef.current?.markers ?? []).some((m) => m.pulse);
      // One more frame after motion stops, to redraw at full detail.
      const settling = now - lastMove.current < IDLE_HI_MS + 40;
      draw(now);
      if (again || moving.current || hasPulse || settling) {
        frame.current = requestAnimationFrame(tick);
      }
    },
    [draw],
  );

  const kick = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(tick);
  }, [tick]);

  // The full detail arrived: draw it.
  useEffect(() => world.subscribe(() => kick()), [world, kick]);

  // Redraw whenever the scene, spin or theme changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the props are read through refs
  useEffect(() => {
    kick();
  }, [scene, spin, kick]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-read colours on a theme change
  useEffect(() => {
    palette.current = null;
    themeKey.current++;
    kick();
  }, [themeVersion, kick]);

  // Fly on a new focus key.
  const focusKey = focus?.key;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key decides, not the object
  useEffect(() => {
    if (!focus) return;
    const cam = camera.current;
    flight.current = {
      from: center(cam),
      to: focus.at,
      z0: cam.zoom,
      z1: clampZoom(focus.zoom),
      start: performance.now(),
      ms: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : FLIGHT_MS,
    };
    kick();
  }, [focusKey, kick]);

  // Size to the element, crisp on HiDPI.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size.current = { w: rect.width, h: rect.height, dpr };
      for (const c of [canvas, backRef.current]) {
        if (!c) continue;
        c.width = Math.round(rect.width * dpr);
        c.height = Math.round(rect.height * dpr);
      }
      draw(performance.now());
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  // The GPU land layer; without WebGL2 the land is drawn on the back canvas.
  useLayoutEffect(() => {
    const c = glCanvasRef.current;
    if (!c) return;
    glRef.current = GlobeGL.create(c);
    colorsFor.current = { scene: null, key: "", splits: [] };
    return () => {
      glRef.current?.dispose();
      glRef.current = null;
    };
  }, []);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      // Cleared, or a remount (StrictMode) could never schedule a frame again.
      frame.current = null;
    },
    [],
  );

  // ── Input ────────────────────────────────────────────────────────────

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; t: number; moved: number; pinch: number | null }>({
    x: 0,
    y: 0,
    t: 0,
    moved: 0,
    pinch: null,
  });

  const radiusPx = () => baseRadius(size.current.w, size.current.h) * camera.current.zoom;

  const touched = () => {
    lastTouch.current = performance.now();
    flight.current = null;
  };

  const settle = () => {
    moving.current = false;
    lastMove.current = performance.now();
    onViewRef.current?.({ at: center(camera.current), zoom: camera.current.zoom });
    kick();
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    touched();
    if (pointers.current.size === 1) {
      gesture.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, pinch: null };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.moved = CLICK_SLOP + 1; // a pinch is never a click
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cam = camera.current;
    if (pointers.current.size >= 2 && gesture.current.pinch) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      cam.zoom = clampZoom(cam.zoom * (d / gesture.current.pinch));
      gesture.current.pinch = d;
    } else {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      gesture.current.moved += Math.abs(dx) + Math.abs(dy);
      if (gesture.current.moved <= CLICK_SLOP) return;
      const k = 180 / (Math.PI * radiusPx());
      cam.lambda += dx * k;
      cam.phi = Math.max(-89, Math.min(89, cam.phi - dy * k));
    }
    moving.current = true;
    touched();
    kick();
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 0) {
      if (g.moved <= CLICK_SLOP && performance.now() - g.t < 800) pick(e);
      settle();
    }
  };

  const pick = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !onPickRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { w, h } = size.current;
    const r = radiusPx();
    if (Math.hypot(x - w / 2, y - h / 2) > r) return;
    const cam = camera.current;
    const at = geoOrthographic()
      .rotate([cam.lambda, cam.phi])
      .scale(r)
      .translate([w / 2, h / 2])
      .clipAngle(90)
      .invert?.([x, y]);
    if (at) onPickRef.current([at[0], at[1]]);
  };

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the handlers only touch refs
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !interactive) return;
    let timer: number | undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = camera.current;
      cam.zoom = clampZoom(cam.zoom * Math.exp(-e.deltaY * 0.0015));
      moving.current = true;
      touched();
      kick();
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 120);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      window.clearTimeout(timer);
    };
  }, [interactive, kick]);

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const cam = camera.current;
    const step = 12 / cam.zoom;
    switch (e.key) {
      case "ArrowLeft":
        cam.lambda += step;
        break;
      case "ArrowRight":
        cam.lambda -= step;
        break;
      case "ArrowUp":
        cam.phi = Math.max(-89, cam.phi - step);
        break;
      case "ArrowDown":
        cam.phi = Math.min(89, cam.phi + step);
        break;
      case "+":
      case "=":
        cam.zoom = clampZoom(cam.zoom * 1.3);
        break;
      case "-":
        cam.zoom = clampZoom(cam.zoom / 1.3);
        break;
      default:
        return;
    }
    e.preventDefault();
    touched();
    settle();
  };

  return (
    <div className={cn("relative h-full w-full", className)}>
      {/* Water, then the GPU land: decoration under the interactive top canvas. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas ref={backRef} className="absolute inset-0 h-full w-full" />
        <canvas ref={glCanvasRef} className="absolute inset-0 h-full w-full" />
      </div>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        tabIndex={interactive ? 0 : -1}
        className={cn(
          "absolute inset-0 block h-full w-full touch-none select-none outline-none",
          interactive && "cursor-grab active:cursor-grabbing",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

/**
 * The GPU colour table: land colour per feature with the scene's fills
 * blended over it — row 0 for the feature (or the west of its split
 * meridian), row 1 for the east of the split.
 */
function colorTable(
  ids: readonly string[],
  fills: readonly GlobeFill[],
  pal: GlobePalette,
): { rgba: Uint8Array; splits: Split[] } {
  const n = ids.length;
  const rgba = new Uint8Array(n * 2 * 4);
  const land = toRgb(pal.land);
  for (let i = 0; i < n * 2; i++) {
    rgba[i * 4] = land[0];
    rgba[i * 4 + 1] = land[1];
    rgba[i * 4 + 2] = land[2];
    rgba[i * 4 + 3] = 255;
  }
  const index = new Map(ids.map((id, i) => [id, i]));
  const splits = new Map<number, number>();
  for (const f of fills) {
    const i = index.get(f.feature);
    if (i === undefined) continue;
    const tone = toRgb(pal.tone[f.tone]);
    const a = f.alpha ?? 1;
    const rows = f.clip ? [f.clip.side === "west" ? 0 : 1] : [0, 1];
    if (f.clip) splits.set(i, (f.clip.lon * Math.PI) / 180);
    for (const row of rows) {
      const o = (row * n + i) * 4;
      for (let k = 0; k < 3; k++) rgba[o + k] = Math.round(rgba[o + k] * (1 - a) + tone[k] * a);
    }
  }
  return { rgba, splits: [...splits].map(([feature, lon]) => ({ feature, lon })) };
}
