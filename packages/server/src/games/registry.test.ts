import { GAME_MANIFESTS, getManifest } from "@boardgames/core/games/manifests";
import { describe, expect, it } from "vitest";
import { getRegisteredSlugs, getServerGame } from "./registry.ts";

describe("server game registry", () => {
  it("registers exactly the games that have a manifest", () => {
    expect(getRegisteredSlugs().sort()).toEqual(GAME_MANIFESTS.map((m) => m.slug).sort());
  });

  it.each(getRegisteredSlugs())("%s's spec carries the manifest the browser reads", (slug) => {
    expect(getServerGame(slug)?.spec.manifest).toBe(getManifest(slug));
  });

  it.each(
    GAME_MANIFESTS.map((m) => [m.slug, m] as const),
  )("%s's manifest is self-consistent", (_slug, manifest) => {
    expect(manifest.seats.min).toBeGreaterThanOrEqual(1);
    expect(manifest.seats.max).toBeGreaterThanOrEqual(manifest.seats.min);
    if (manifest.defaultStrategy !== undefined) {
      expect(manifest.strategies.map((s) => s.id)).toContain(manifest.defaultStrategy);
    }
    expect(new Set(manifest.strategies.map((s) => s.id)).size).toBe(manifest.strategies.length);
    if (manifest.seatNames) expect(manifest.seatNames.length).toBe(manifest.seats.max);
    // `{}` must parse — the lobby and solo setup start from the defaults.
    expect(manifest.config.safeParse({}).success).toBe(true);
  });
});
