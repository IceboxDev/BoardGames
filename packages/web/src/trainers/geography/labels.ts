import type { GeoCatalog, Lang } from "@boardgames/core/trainers/geography/catalog";
import type { OpenGroup } from "@boardgames/core/trainers/geography/session";

/** "Countries of Europe", "Cities of Western Europe", "The continents". */
export function groupLabel(catalog: GeoCatalog, g: OpenGroup, lang: Lang): string {
  if (g.kind === "continents") return lang === "de" ? "Die Kontinente" : "The continents";
  if (g.kind === "countries") {
    const c = g.continent ? catalog.continentByCode.get(g.continent) : undefined;
    const name = c ? (lang === "de" ? c.nameDe : c.nameEn) : "";
    return lang === "de" ? `Staaten · ${name}` : `Countries of ${name}`;
  }
  const s = g.subregion ? catalog.subregionById.get(g.subregion) : undefined;
  const name = s ? (lang === "de" ? s.nameDe : s.nameEn) : "";
  return lang === "de" ? `Städte · ${name}` : `Cities of ${name}`;
}
