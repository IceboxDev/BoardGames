// Migration 0037 — per-user site theme.
//
// The appearance system (surfaces, accent ramp, pattern, typography, ambient
// effects) is one JSON blob validated by `ThemeConfigSchema` at the wire
// boundary — a column per knob would only add ways for the schema and the
// storage to drift. NULL means "Classic" (the stock look); the web mirrors the
// blob in localStorage so the theme paints before the profile fetch lands.

import type { Migration } from "./types.ts";

export const userTheme: Migration = {
  version: 37,
  name: "user_theme",
  statements: ["ALTER TABLE user_profiles ADD COLUMN theme_json TEXT"],
};
