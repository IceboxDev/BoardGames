import { createCatalog, type GeoCatalog } from "./catalog.ts";
import placesRaw from "./content/places.json" with { type: "json" };
import { PlacesSchema } from "./content-types.ts";

// The committed deck (≈ 170 KB), parsed once on first use. The server
// validates card ids against it; the web imports it inside the trainer's
// lazy route only.

let catalog: GeoCatalog | null = null;

export function geoCatalog(): GeoCatalog {
  catalog ??= createCatalog(PlacesSchema.parse(placesRaw));
  return catalog;
}
