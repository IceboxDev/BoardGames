// Tone → hex for SVG fills and strokes. Charts can't use Tailwind classes for
// gradients/strokes, so this is the one sanctioned bridge from the `tones.ts`
// vocabulary to raw color values. Values mirror the Tailwind palette hues the
// class recipes use (accent = `DEFAULT_ACCENT`).

import { DEFAULT_ACCENT } from "../../../lib/accent";
import type { Tone } from "../tones";

const TONE_HEX: Record<Tone, string> = {
  accent: DEFAULT_ACCENT,
  amber: "#fbbf24",
  sky: "#38bdf8",
  emerald: "#10b981",
  rose: "#f43f5e",
  purple: "#a855f7",
  orange: "#f97316",
  cyan: "#22d3ee",
  neutral: "#6b7387",
};

export function chartHex(tone: Tone): string {
  return TONE_HEX[tone];
}

/** Resolve a chart color prop pair: explicit `color` wins over `tone`. */
export function resolveChartColor(color: string | undefined, tone: Tone | undefined): string {
  return color ?? chartHex(tone ?? "accent");
}
