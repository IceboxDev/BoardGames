import { describe, expect, it } from "vitest";
import cyberpunk from "./cyberpunk";
import dawn from "./dawn";
import ember from "./ember";
import nord from "./nord";
import ocean from "./ocean";
import sakura from "./sakura";
import terminal from "./terminal";

type PresetModule = {
  key: string;
  label: string;
  order: number;
  config: Record<string, string | number | boolean | null>;
};

const presets: PresetModule[] = [dawn, ocean, ember, terminal, cyberpunk, sakura, nord];

const CONFIG_KEYS = [
  "preset",
  "surface950",
  "surface900",
  "surface800",
  "surface700",
  "surface600",
  "fgPrimary",
  "fgSecondary",
  "fgMuted",
  "fgDisabled",
  "accent",
  "neonCyan",
  "neonPurple",
  "neonPink",
  "pattern",
  "patternColor",
  "patternOpacity",
  "wallpaper",
  "radiusCard",
  "radiusUi",
  "selectionStyle",
  "fontFamily",
  "baseFontSize",
  "ambientMode",
  "ambientEffect",
  "accentMode",
] as const;

const COLOR_KEYS = [
  "surface950",
  "surface900",
  "surface800",
  "surface700",
  "surface600",
  "fgPrimary",
  "fgSecondary",
  "fgMuted",
  "fgDisabled",
  "accent",
  "neonCyan",
  "neonPurple",
  "neonPink",
  "patternColor",
] as const;

const HEX_RE = /^#[0-9a-f]{6}$/;
const PATTERN_KEYS = [
  "doodles",
  "constellation",
  "waves",
  "crosshatch",
  "dotgrid",
  "circuit",
  "petals",
  "diamonds",
  "none",
];
const SELECTION_STYLES = ["bar", "glow", "border", "fill", "underline"];
const FONT_FAMILIES = ["inter", "jetbrains"];

describe("theme presets pack", () => {
  it("has unique keys and unique orders", () => {
    const keys = presets.map((p) => p.key);
    const orders = presets.map((p) => p.order);
    expect(new Set(keys).size).toBe(presets.length);
    expect(new Set(orders).size).toBe(presets.length);
  });

  for (const preset of presets) {
    describe(preset.key, () => {
      it("exposes key, label, and integer order", () => {
        expect(preset.key).toMatch(/^[a-z]+$/);
        expect(preset.label.length).toBeGreaterThan(0);
        expect(Number.isInteger(preset.order)).toBe(true);
        expect(preset.config.preset).toBe(preset.key);
      });

      it("has exactly the contract config keys", () => {
        expect(Object.keys(preset.config).sort()).toEqual([...CONFIG_KEYS].sort());
      });

      it("uses valid 6-digit lowercase hex for every color", () => {
        for (const key of COLOR_KEYS) {
          expect(preset.config[key], `${preset.key}.${key}`).toMatch(HEX_RE);
        }
      });

      it("keeps numeric fields in range", () => {
        const { patternOpacity, radiusCard, radiusUi, baseFontSize } = preset.config;
        expect(typeof patternOpacity).toBe("number");
        expect(patternOpacity).toBeGreaterThanOrEqual(0);
        expect(patternOpacity).toBeLessThanOrEqual(1);
        for (const radius of [radiusCard, radiusUi]) {
          expect(Number.isInteger(radius)).toBe(true);
          expect(radius).toBeGreaterThanOrEqual(0);
        }
        expect(Number.isInteger(baseFontSize)).toBe(true);
        expect(baseFontSize).toBeGreaterThanOrEqual(13);
        expect(baseFontSize).toBeLessThanOrEqual(18);
      });

      it("uses known enum values", () => {
        expect(PATTERN_KEYS).toContain(preset.config.pattern);
        expect(SELECTION_STYLES).toContain(preset.config.selectionStyle);
        expect(FONT_FAMILIES).toContain(preset.config.fontFamily);
        expect(preset.config.wallpaper).toBe(false);
        expect(preset.config.ambientMode).toBe("auto");
        expect(preset.config.accentMode).toBe("custom");
        const { ambientEffect } = preset.config;
        expect(ambientEffect === null || typeof ambientEffect === "string").toBe(true);
      });
    });
  }
});
