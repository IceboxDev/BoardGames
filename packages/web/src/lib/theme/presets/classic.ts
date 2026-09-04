// Preset contract (see ../registry.ts): default-export a PLAIN OBJECT with
// { key, label, order, config } and NO imports — presets are data, validated
// and merged over DEFAULT_THEME by the registry at load time.
//
// Classic is today's stock look, field for field. It must stay in lockstep
// with DEFAULT_THEME in ../config.ts (and the `@theme` fallbacks in
// index.css): selecting it removes every :root override.

const classic = {
  key: "classic",
  label: "Classic",
  order: 0,
  config: {
    preset: "classic",
    surface950: "#08090d",
    surface900: "#0f1117",
    surface800: "#171923",
    surface700: "#1f2233",
    surface600: "#2a2d42",
    fgPrimary: "#e2e6ee",
    fgSecondary: "#9aa3b4",
    fgMuted: "#6b7387",
    fgDisabled: "#495164",
    accent: "#6366f1",
    neonCyan: "#22d3ee",
    neonPurple: "#a855f7",
    neonPink: "#ec4899",
    pattern: "none",
    patternColor: "#6366f1",
    patternOpacity: 0.4,
    wallpaper: false,
    radiusCard: 12,
    radiusUi: 8,
    avatarShape: "circle",
    selectionStyle: "bar",
    fontFamily: "inter",
    baseFontSize: 16,
    ambientMode: "auto",
    ambientEffect: null,
    accentMode: "custom",
  },
};

export default classic;
