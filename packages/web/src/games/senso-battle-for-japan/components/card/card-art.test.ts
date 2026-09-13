import { CLANS } from "@boardgames/core/games/senso-battle-for-japan/types";
import { describe, expect, it } from "vitest";
import {
  ART_MANIFEST,
  ART_NAMES,
  artNamesFor,
  cardArtUrl,
  missingCardArt,
  orphanCardArt,
} from "./card-art";

/** The manifest, derived from the deck — so neither side can drift. */
function expectedNames(): string[] {
  const names: string[] = [];
  for (const clan of CLANS) names.push(`crest-${clan}`, `crest-${clan}-sm`, `kanji-${clan}`);
  for (const clan of CLANS) {
    for (const rank of ["jack", "queen", "king"]) names.push(`court-${clan}-${rank}`);
  }
  names.push(
    "kanji-ninja",
    "ninja-wood",
    "ninja-jade",
    "ace-halo",
    "seal-advantage",
    "paper-grain",
    "back-pattern",
    "back-emblem",
    "corner-ornament",
  );
  return names.sort();
}

describe("card art manifest", () => {
  it("names exactly the blocks the deck is composed from", () => {
    expect([...ART_NAMES].sort()).toEqual(expectedNames());
  });

  it("derives small variants from a known source and keeps sizes sane", () => {
    for (const [name, entry] of Object.entries(ART_MANIFEST)) {
      expect(entry.maxPx, name).toBeGreaterThanOrEqual(64);
      expect(entry.maxPx, name).toBeLessThanOrEqual(1024);
      if ("src" in entry) expect(ART_NAMES, `${name} src`).toContain(entry.src);
    }
  });

  it("has no webp on disk that the manifest does not know", () => {
    expect(orphanCardArt()).toEqual([]);
  });

  it("reports missing blocks and answers undefined for them", () => {
    for (const name of missingCardArt()) expect(cardArtUrl(name)).toBeUndefined();
  });
});

describe("artNamesFor", () => {
  it("lists the blocks each kind of card draws", () => {
    expect(artNamesFor("takeda-7")).toEqual(["crest-takeda-sm", "kanji-takeda", "paper-grain"]);
    expect(artNamesFor("oda-13")).toEqual([
      "crest-oda-sm",
      "kanji-oda",
      "paper-grain",
      "court-oda-king",
    ]);
    expect(artNamesFor("mori-14")).toEqual([
      "crest-mori-sm",
      "kanji-mori",
      "paper-grain",
      "crest-mori",
      "ace-halo",
    ]);
    expect(artNamesFor("ninja-jade")).toEqual(["ninja-jade", "kanji-ninja", "paper-grain"]);
    expect(artNamesFor("uesugi-14", true)).toEqual(["crest-uesugi", "kanji-uesugi", "paper-grain"]);
  });
});
