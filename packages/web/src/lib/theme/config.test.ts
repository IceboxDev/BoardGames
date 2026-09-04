import { ThemeConfigSchema } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, isDefaultTheme, THEME_IDENTITY_KEYS, THEME_KEYS } from "./config.ts";

describe("DEFAULT_THEME", () => {
  it("round-trips through ThemeConfigSchema unchanged", () => {
    // The default must be storable/sendable verbatim — if the schema ever
    // rejects or rewrites it, the mirror and the server column would drift.
    expect(ThemeConfigSchema.parse(DEFAULT_THEME)).toEqual(DEFAULT_THEME);
  });

  it("is detected by isDefaultTheme, including structural copies", () => {
    expect(isDefaultTheme(DEFAULT_THEME)).toBe(true);
    expect(isDefaultTheme({ ...DEFAULT_THEME })).toBe(true);
    expect(isDefaultTheme({ ...DEFAULT_THEME, accent: "#5b8dee" })).toBe(false);
    expect(isDefaultTheme({ ...DEFAULT_THEME, baseFontSize: 17 })).toBe(false);
  });

  it("keeps THEME_KEYS and THEME_IDENTITY_KEYS consistent with the schema", () => {
    const schemaKeys = Object.keys(ThemeConfigSchema.shape).sort();
    expect([...THEME_KEYS].sort()).toEqual(schemaKeys);
    for (const key of THEME_IDENTITY_KEYS) expect(THEME_KEYS).toContain(key);
  });
});
