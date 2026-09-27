import { getManifest } from "@boardgames/core/games/manifests";
import { TournamentResultsSchema } from "@boardgames/core/tournament/results";
import { describe, expect, it } from "vitest";
import { games } from "./registry";

// Every committed tournament file, keyed by its game folder.
const files = import.meta.glob<{ default: unknown }>("./*/tournament-results.generated.ts", {
  eager: true,
});
const bySlug = new Map(
  Object.entries(files).map(([path, mod]) => [path.split("/")[1] ?? "", mod.default]),
);

describe("tournament results", () => {
  it.each([...bySlug])("%s parses and names only its manifest's strategies", (slug, data) => {
    const results = TournamentResultsSchema.parse(data);
    expect(results.slug).toBe(slug);
    const manifest = getManifest(slug);
    expect(manifest, `${slug} has no manifest`).toBeDefined();
    const known = new Set(manifest?.strategies.map((s) => s.id));
    for (const table of results.tables) {
      for (const m of table.matchups) {
        expect(known.has(m.a) && known.has(m.b), `${slug}: ${m.a} vs ${m.b}`).toBe(true);
      }
    }
  });

  it("is wired to the Tournament page exactly for the games that have a file", () => {
    const wired = games
      .filter((g) => g.kind === "playable" && g.tournamentResults)
      .map((g) => g.slug)
      .sort();
    expect(wired).toEqual([...bySlug.keys()].sort());
  });
});
