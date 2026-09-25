import { type GeoCatalog, type Lang, placeName } from "./catalog.ts";
import type { Place } from "./content-types.ts";

// One line of context for a place being studied: what it borders, whether
// it has a coast, its capital — the hooks that make a location stick
// (elaborative encoding) instead of a bare name on a blob.

const MAX_NEIGHBOURS = 4;

function list(names: string[], more: number, lang: Lang): string {
  const shown = names.join(", ");
  if (more <= 0) return shown;
  return lang === "de" ? `${shown} und ${more} weitere` : `${shown} and ${more} more`;
}

function people(pop: number, lang: Lang): string {
  if (pop >= 1e6) {
    const m = pop >= 1e7 ? Math.round(pop / 1e6) : Math.round(pop / 1e5) / 10;
    const n = lang === "de" ? String(m).replace(".", ",") : String(m);
    return lang === "de" ? `${n} Mio. Einwohner` : `${n} million people`;
  }
  const k = Math.round(pop / 1000);
  return lang === "de" ? `${k}.000 Einwohner` : `${k},000 people`;
}

export function anchorLine(catalog: GeoCatalog, place: Place, lang: Lang): string {
  if (place.kind === "continent") {
    const n = catalog.countries.filter((c) => c.continent === place.code).length;
    if (n === 0) return lang === "de" ? "Keine Staaten" : "No countries";
    return lang === "de" ? `${n} Staaten` : `${n} countries`;
  }
  if (place.kind === "country") {
    const parts: string[] = [];
    const sub = catalog.subregionById.get(place.subregion);
    if (sub) parts.push(lang === "de" ? sub.nameDe : sub.nameEn);
    if (place.landlocked) parts.push(lang === "de" ? "Binnenstaat" : "Landlocked");
    const neighbours = place.neighbours
      .map((id) => catalog.byId.get(id))
      .filter((p): p is Place => !!p)
      .sort((a, b) => ("pop" in b ? b.pop : 0) - ("pop" in a ? a.pop : 0));
    if (neighbours.length > 0) {
      const names = neighbours.slice(0, MAX_NEIGHBOURS).map((p) => placeName(p, lang));
      const more = neighbours.length - MAX_NEIGHBOURS;
      parts.push(`${lang === "de" ? "grenzt an" : "borders"} ${list(names, more, lang)}`);
    } else {
      parts.push(lang === "de" ? "Inselstaat" : "Island country");
    }
    const capital = place.capital ? catalog.byId.get(place.capital) : undefined;
    if (capital) {
      parts.push(`${lang === "de" ? "Hauptstadt" : "capital"} ${placeName(capital, lang)}`);
    }
    return parts.join(" · ");
  }
  const country = catalog.byId.get(place.country);
  const cname = country ? placeName(country, lang) : "";
  const role = place.capital
    ? lang === "de"
      ? `Hauptstadt von ${cname}`
      : `Capital of ${cname}`
    : lang === "de"
      ? `Stadt in ${cname}`
      : `City in ${cname}`;
  return place.pop > 0 ? `${role} · ${people(place.pop, lang)}` : role;
}

/**
 * The Name card's second hint: context that narrows the answer down without
 * naming it (its region and neighbours for a country, its country for a
 * city, its size for a continent).
 */
export function nameHint(catalog: GeoCatalog, place: Place, lang: Lang): string {
  if (place.kind === "continent") return anchorLine(catalog, place, lang);
  if (place.kind === "city") {
    const country = catalog.byId.get(place.country);
    const cname = country ? placeName(country, lang) : "";
    const role = place.capital
      ? lang === "de"
        ? `Die Hauptstadt von ${cname}`
        : `The capital of ${cname}`
      : lang === "de"
        ? `Eine Stadt in ${cname}`
        : `A city in ${cname}`;
    return place.pop > 0 ? `${role} · ${people(place.pop, lang)}` : role;
  }
  // A country: everything the anchor says except its capital.
  const capital = place.capital ? catalog.byId.get(place.capital) : undefined;
  const drop = capital
    ? `${lang === "de" ? "Hauptstadt" : "capital"} ${placeName(capital, lang)}`
    : null;
  return anchorLine(catalog, place, lang)
    .split(" · ")
    .filter((part) => part !== drop)
    .join(" · ");
}
