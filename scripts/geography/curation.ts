// Hand-curated parts of the World Geography deck; everything else comes from
// Natural Earth. Consumed only by `scripts/geography-import.ts`.

import type { ContinentId } from "../../packages/core/src/trainers/geography/content-types.ts";

/** The 193 UN member states, by ISO 3166 alpha-3. */
export const UN_MEMBERS = `
AFG ALB DZA AND AGO ATG ARG ARM AUS AUT AZE BHS BHR BGD BRB BLR BEL BLZ BEN BTN BOL BIH BWA BRA
BRN BGR BFA BDI CPV KHM CMR CAN CAF TCD CHL CHN COL COM COG COD CRI CIV HRV CUB CYP CZE DNK DJI
DMA DOM ECU EGY SLV GNQ ERI EST SWZ ETH FJI FIN FRA GAB GMB GEO DEU GHA GRC GRD GTM GIN GNB GUY
HTI HND HUN ISL IND IDN IRN IRQ IRL ISR ITA JAM JPN JOR KAZ KEN KIR PRK KOR KWT KGZ LAO LVA LBN
LSO LBR LBY LIE LTU LUX MDG MWI MYS MDV MLI MLT MHL MRT MUS MEX FSM MDA MCO MNG MNE MAR MOZ MMR
NAM NRU NPL NLD NZL NIC NER NGA MKD NOR OMN PAK PLW PAN PNG PRY PER PHL POL PRT QAT ROU RUS RWA
KNA LCA VCT WSM SMR STP SAU SEN SRB SYC SLE SGP SVK SVN SLB SOM ZAF SSD ESP LKA SDN SUR SWE CHE
SYR TJK TZA THA TLS TGO TON TTO TUN TUR TKM TUV UGA UKR ARE GBR USA URY UZB VUT VEN VNM YEM ZMB
ZWE
`
  .trim()
  .split(/\s+/);

/** Quizzed beyond the UN members: the two observers, Kosovo and Taiwan. */
export const EXTRA_STATES = ["VAT", "PSE", "XKX", "TWN"];

/** Our id → Natural Earth ADM0_A3 where they differ. */
export const NE_CODE: Record<string, string> = {
  SSD: "SDS",
  PSE: "PSX",
  XKX: "KOS",
};

/** Natural Earth features folded into a quizzed country (de-facto states). */
export const MERGE_INTO: Record<string, string> = {
  SOL: "SOM", // Somaliland
  CYN: "CYP", // Northern Cyprus
  // Enclaves the 10m map draws on their own; a click there is on the host's soil.
  CNM: "CYP", // UN buffer zone
  ESB: "CYP", // Dhekelia
  WSB: "CYP", // Akrotiri
  KAB: "KAZ", // Baikonur
  USG: "CUB", // Guantánamo
  BRI: "BRA", // Brazilian Island
};

export const CONTINENTS: {
  code: ContinentId;
  nameEn: string;
  nameDe: string;
  aliases: string[];
  ne: string;
  focus: [number, number];
}[] = [
  { code: "eu", nameEn: "Europe", nameDe: "Europa", aliases: [], ne: "Europe", focus: [15, 50] },
  { code: "as", nameEn: "Asia", nameDe: "Asien", aliases: [], ne: "Asia", focus: [90, 35] },
  { code: "af", nameEn: "Africa", nameDe: "Afrika", aliases: [], ne: "Africa", focus: [20, 3] },
  {
    code: "na",
    nameEn: "North America",
    nameDe: "Nordamerika",
    aliases: [],
    ne: "North America",
    focus: [-98, 40],
  },
  {
    code: "sa",
    nameEn: "South America",
    nameDe: "Südamerika",
    aliases: [],
    ne: "South America",
    focus: [-60, -18],
  },
  {
    code: "oc",
    nameEn: "Oceania",
    nameDe: "Ozeanien",
    aliases: ["Australia", "Australien", "Australia and Oceania", "Australien und Ozeanien"],
    ne: "Oceania",
    focus: [145, -22],
  },
  {
    code: "an",
    nameEn: "Antarctica",
    nameDe: "Antarktika",
    aliases: ["Antarktis"],
    ne: "Antarctica",
    focus: [0, -85],
  },
];

/** Where Natural Earth puts an island state in the "Seven seas". */
export const CONTINENT_OVERRIDE: Record<string, ContinentId> = {
  MUS: "af",
  SYC: "af",
  MDV: "as",
  CYP: "eu",
};

/**
 * Countries the continent line runs through, split at a meridian: the part
 * west of `lon` belongs to `west`, the rest to `east` (the Urals, the Ural
 * river, the Bosporus, the Suez canal — close enough on a globe).
 */
export const CONTINENT_SPLIT: Record<string, { lon: number; west: ContinentId; east: ContinentId }> =
  {
    RUS: { lon: 60, west: "eu", east: "as" },
    KAZ: { lon: 51.5, west: "eu", east: "as" },
    TUR: { lon: 29.1, west: "eu", east: "as" },
    EGY: { lon: 32.4, west: "af", east: "as" },
  };

/** Subregion where Natural Earth's disagrees with the continent override. */
export const SUBREGION_OVERRIDE: Record<string, string> = { CYP: "Southern Europe" };

/** Transcontinental countries: a click on them also counts for these. */
export const ALSO_CONTINENTS: Record<string, ContinentId[]> = {
  RUS: ["as"],
  TUR: ["eu"],
  KAZ: ["eu"],
  AZE: ["eu"],
  GEO: ["eu"],
  ARM: ["eu"],
  CYP: ["as"],
  EGY: ["as"],
  IDN: ["oc"],
  TLS: ["oc"],
  PNG: ["as"],
};

/** Subregion names in German, keyed by Natural Earth SUBREGION. */
export const SUBREGION_DE: Record<string, string> = {
  "Western Europe": "Westeuropa",
  "Northern Europe": "Nordeuropa",
  "Southern Europe": "Südeuropa",
  "Eastern Europe": "Osteuropa",
  "Western Asia": "Westasien",
  "Central Asia": "Zentralasien",
  "Southern Asia": "Südasien",
  "Eastern Asia": "Ostasien",
  "South-Eastern Asia": "Südostasien",
  "Northern Africa": "Nordafrika",
  "Western Africa": "Westafrika",
  "Middle Africa": "Zentralafrika",
  "Eastern Africa": "Ostafrika",
  "Southern Africa": "Südliches Afrika",
  "Northern America": "Nördliches Amerika",
  "Central America": "Mittelamerika",
  Caribbean: "Karibik",
  "South America": "Südamerika",
  "Australia and New Zealand": "Australien und Neuseeland",
  Melanesia: "Melanesien",
  Micronesia: "Mikronesien",
  Polynesia: "Polynesien",
};

/** Subregion introduction order per continent (the big, familiar ones first). */
export const SUBREGION_ORDER = [
  "Western Europe",
  "Southern Europe",
  "Northern Europe",
  "Eastern Europe",
  "Eastern Asia",
  "Southern Asia",
  "South-Eastern Asia",
  "Western Asia",
  "Central Asia",
  "Northern Africa",
  "Southern Africa",
  "Eastern Africa",
  "Western Africa",
  "Middle Africa",
  "Northern America",
  "Central America",
  "Caribbean",
  "South America",
  "Australia and New Zealand",
  "Melanesia",
  "Polynesia",
  "Micronesia",
];

/**
 * Display names (EN / DE) where Natural Earth's differ from common usage,
 * plus extra accepted spellings. The NE names that get replaced are kept as
 * aliases automatically.
 */
export const COUNTRY_NAMES: Record<string, { en?: string; de?: string; aliases?: string[] }> = {
  CHN: { en: "China", de: "China" },
  USA: {
    en: "United States",
    de: "Vereinigte Staaten",
    aliases: ["USA", "US", "America", "Amerika", "Vereinigte Staaten von Amerika"],
  },
  GBR: {
    aliases: ["UK", "Great Britain", "Britain", "Großbritannien", "Grossbritannien"],
  },
  CZE: { en: "Czechia", aliases: ["Czech Republic", "Tschechische Republik"] },
  CIV: { en: "Côte d'Ivoire", aliases: ["Ivory Coast", "Cote d'Ivoire"] },
  TLS: { en: "Timor-Leste", aliases: ["East Timor", "Timor-Leste", "Ost-Timor"] },
  FSM: { en: "Micronesia", de: "Mikronesien", aliases: ["Federated States of Micronesia"] },
  CPV: { en: "Cabo Verde", aliases: ["Cape Verde", "Cabo Verde"] },
  COG: {
    aliases: ["Congo", "Kongo", "Congo-Brazzaville", "Kongo-Brazzaville", "Congo Republic"],
  },
  COD: {
    en: "DR Congo",
    de: "DR Kongo",
    aliases: [
      "Democratic Republic of the Congo",
      "DRC",
      "Congo-Kinshasa",
      "Kongo-Kinshasa",
      "Demokratische Republik Kongo",
    ],
  },
  GMB: { en: "Gambia", aliases: ["The Gambia"] },
  BHS: { en: "Bahamas", aliases: ["The Bahamas"] },
  CYP: { de: "Zypern" },
  TWN: { de: "Taiwan", aliases: ["Republic of China", "Republik China"] },
  MDA: { de: "Moldau", aliases: ["Republik Moldau", "Moldawien", "Moldova"] },
  BLR: { de: "Belarus", aliases: ["Weißrussland", "Weissrussland", "Byelorussia"] },
  MKD: { aliases: ["Macedonia", "Mazedonien"] },
  MMR: { aliases: ["Burma", "Birma"] },
  SWZ: { aliases: ["Swaziland", "Swasiland"] },
  TUR: { aliases: ["Türkiye", "Turkiye"] },
  VAT: { en: "Vatican City", de: "Vatikanstadt", aliases: ["Vatican", "Holy See", "Vatikan"] },
  PSE: { aliases: ["Palestinian territories", "Palästinensische Gebiete", "State of Palestine"] },
  XKX: { aliases: [] },
  NLD: { aliases: ["Holland"] },
  KOR: { aliases: ["Korea", "Republic of Korea"] },
  PRK: { aliases: ["DPRK"] },
  LAO: { aliases: ["Lao PDR"] },
  STP: { aliases: ["Sao Tome and Principe", "Sao Tome"] },
  ARE: { aliases: ["UAE", "VAE", "Emirates", "Emirate"] },
  CAF: { aliases: ["CAR", "ZAR"] },
  BIH: { aliases: ["Bosnia", "Bosnien"] },
  TTO: { aliases: ["Trinidad"] },
  KNA: { aliases: ["Saint Kitts", "St. Kitts"] },
  VCT: { aliases: ["Saint Vincent", "St. Vincent"] },
  ATG: { aliases: ["Antigua"] },
  PNG: { aliases: ["Papua Neuguinea"] },
  GNB: { aliases: ["Guinea Bissau"] },
  GNQ: { aliases: ["Equatorial Guinea"] },
};

/** Natural Earth ADM0_A3 of dual/ambiguous capitals → the one we call "the" capital. */
export const CAPITAL_OVERRIDE: Record<string, string> = {
  BOL: "Sucre",
  NLD: "Amsterdam",
  ZAF: "Pretoria",
  MYS: "Kuala Lumpur",
  LKA: "Sri Jayawardenepura Kotte",
  CIV: "Yamoussoukro",
  BEN: "Porto-Novo",
  TZA: "Dodoma",
  CHE: "Bern",
  PSE: "Ramallah",
  XKX: "Pristina",
};

/** City names where Natural Earth is outdated or unusual (keyed by NE NAME). */
export const CITY_NAMES: Record<string, { en?: string; de?: string; aliases?: string[] }> = {
  "Nur-Sultan": { en: "Astana", de: "Astana", aliases: ["Nur-Sultan"] },
  Washington: { en: "Washington, D.C.", aliases: ["Washington", "Washington DC"] },
  Kyiv: { aliases: ["Kiev", "Kiew"] },
};

/** Landlocked by convention although Natural Earth draws a Caspian coast. */
export const LANDLOCKED_OVERRIDE = new Set(["KAZ", "TKM", "AZE"]);

/** Countries graded by distance to their focus point (too small to hit). */
export const TINY_KM2 = 2_500;

/** Cities: the capital plus the national top N, plus any city above this size, at most MAX. */
export const CITY_RULES = { top: 3, bigPop: 1_000_000, max: 5 };
