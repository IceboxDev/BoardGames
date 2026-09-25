import { readFileSync } from "node:fs";
import { type Places, PlacesSchema } from "./content-types.ts";
import { geoCatalog } from "./deck.ts";

// The real deck, for tests.

export function loadPlaces(): Places {
  return PlacesSchema.parse(
    JSON.parse(readFileSync(new URL("./content/places.json", import.meta.url), "utf8")),
  );
}

export const realCatalog = geoCatalog;
