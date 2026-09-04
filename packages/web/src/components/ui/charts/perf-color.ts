import { chartHex } from "./tone-hex";

/**
 * Performance (0..1) → red→amber→green hsl, muted grey for null. THE color
 * formula for performance numbers — `ProfileStatsPanel` bars and the profile
 * insight pages share it so "62% green" means the same thing everywhere.
 * The null grey is the live `--color-fg-muted` (the `neutral` chart tone),
 * so it follows the active theme; #6b7387 stays the static fallback.
 */
export function perfColor(perf: number | null): string {
  if (perf === null) return chartHex("neutral");
  const hue = 8 + perf * 132; // 8 ≈ red-orange … 140 ≈ green
  return `hsl(${hue}deg 68% 47%)`;
}
