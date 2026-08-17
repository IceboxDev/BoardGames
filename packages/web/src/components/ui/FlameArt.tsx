import flameUrl from "../../assets/flame.svg";

// The group's flame artwork (replaces the old hand-drawn stroke FlameIcon on
// display surfaces). Optionally re-hued to a profile accent: the art is a
// red→yellow gradient around hue ~15°, so a single hue-rotate lands the whole
// flame in the accent's family (indigo accent → blue flame, etc.).

const FLAME_BASE_HUE = 15;

function hueOf(hex: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.03) return null;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function FlameArt({
  className = "h-6 w-6",
  accentHex,
}: {
  className?: string;
  /** Re-hue the flame toward this profile accent; omit for the natural fire. */
  accentHex?: string | null;
}) {
  let filter: string | undefined;
  if (accentHex) {
    const hue = hueOf(accentHex);
    if (hue !== null) {
      let delta = Math.round(hue - FLAME_BASE_HUE);
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      if (Math.abs(delta) >= 12) filter = `hue-rotate(${delta}deg)`;
    }
  }
  return (
    <img
      src={flameUrl}
      alt=""
      aria-hidden="true"
      className={`${className} shrink-0`}
      style={filter ? { filter } : undefined}
    />
  );
}
