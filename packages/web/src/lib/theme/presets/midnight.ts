// Preset contract (see ../registry.ts): default-export a PLAIN OBJECT with
// { key, label, order, config } and NO imports.
//
// Midnight — a deep navy night sky: #0a0e1a surface family, a soft steel-blue
// accent, the constellation pattern and the starfield ambient effect. Glow
// selection + slightly rounder cards give it a softer feel than Classic.
// Unknown registry keys (pattern/effect not yet dropped in) degrade to "no
// layer", so this preset is safe even before those modules land.

const midnight = {
  key: "midnight",
  label: "Midnight",
  order: 1,
  config: {
    preset: "midnight",
    surface950: "#0a0e1a",
    surface900: "#0f1629",
    surface800: "#1a2240",
    surface700: "#232d52",
    surface600: "#2e3a68",
    fgPrimary: "#e4e9f4",
    fgSecondary: "#9aa7c4",
    fgMuted: "#6b7699",
    fgDisabled: "#4a5578",
    accent: "#5b8dee",
    neonCyan: "#22d3ee",
    neonPurple: "#a855f7",
    neonPink: "#ec4899",
    pattern: "constellation",
    patternColor: "#4a6fa5",
    patternOpacity: 0.4,
    wallpaper: false,
    radiusCard: 14,
    radiusUi: 10,
    avatarShape: "circle",
    selectionStyle: "glow",
    fontFamily: "inter",
    baseFontSize: 16,
    ambientMode: "auto",
    ambientEffect: "starfield",
    accentMode: "custom",
  },
};

export default midnight;
