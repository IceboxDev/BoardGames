import { useEffect, useState } from "react";

// The globe paints on a canvas, which cannot read CSS variables: its colours
// are resolved from the theme tokens (through a probe element, so
// `color-mix()` tokens come back as concrete colours) and re-read whenever
// the theme changes.

export type Tone = "accent" | "ok" | "bad" | "warn" | "muted" | "strong";

export interface GlobePalette {
  water: string;
  waterLit: string;
  land: string;
  coast: string;
  border: string;
  graticule: string;
  gridMinor: string;
  gridMajor: string;
  gridLabel: string;
  rim: string;
  label: string;
  font: string;
  tone: Record<Tone, string>;
}

const TOKENS = {
  water: "--color-surface-950",
  waterLit: "--color-surface-900",
  land: "--color-surface-600",
  coast: "--color-line-strong",
  border: "--color-fg-secondary",
  graticule: "--color-line-soft",
  gridMinor: "--color-line",
  gridMajor: "--color-line-strong",
  gridLabel: "--color-fg-secondary",
  rim: "--color-line",
  label: "--color-fg-strong",
  accent: "--color-accent-400",
  ok: "--color-ok-strong",
  bad: "--color-heat-ember",
  warn: "--color-warn",
  muted: "--color-fg-muted",
  strong: "--color-fg-strong",
} as const;

export function readPalette(host: Element): GlobePalette {
  const probe = document.createElement("span");
  probe.style.display = "none";
  host.parentElement?.appendChild(probe);
  const read = (token: string) => {
    probe.style.color = `var(${token})`;
    return getComputedStyle(probe).color;
  };
  const c = Object.fromEntries(
    Object.entries(TOKENS).map(([k, token]) => [k, read(token)]),
  ) as Record<keyof typeof TOKENS, string>;
  const font = getComputedStyle(host).fontFamily || "sans-serif";
  probe.remove();
  return {
    water: c.water,
    waterLit: c.waterLit,
    land: c.land,
    coast: c.coast,
    border: c.border,
    graticule: c.graticule,
    gridMinor: c.gridMinor,
    gridMajor: c.gridMajor,
    gridLabel: c.gridLabel,
    rim: c.rim,
    label: c.label,
    font,
    tone: {
      accent: c.accent,
      ok: c.ok,
      bad: c.bad,
      warn: c.warn,
      muted: c.muted,
      strong: c.strong,
    },
  };
}

/** Bumps whenever the theme may have changed (root attributes, colour scheme). */
export function useThemeVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const bump = () => setV((x) => x + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class", "data-theme"],
    });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bump);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", bump);
    };
  }, []);
  return v;
}

const rgbCache = new Map<string, [number, number, number]>();

/** Any CSS colour as 0–255 RGB (through a 1×1 canvas, so every syntax works). */
export function toRgb(color: string): [number, number, number] {
  const hit = rgbCache.get(color);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d");
  let out: [number, number, number] = [128, 128, 128];
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out = [d[0], d[1], d[2]];
  }
  rgbCache.set(color, out);
  return out;
}
