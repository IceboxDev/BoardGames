// Sky Team scenario palette — base game + Turbulences / Crew expansions
// captured by the printed cards. Each entry records its IATA code, the
// airport's full marketing name, city + country, and the two route colour
// bands ("Airport" / "Altitude") that drive the difficulty banding.
//
// Only `yul-green` is wired up to a backend scenario today (mapped to the
// engine's `yul-montreal` config) — the per-airport approach corridors and
// altitude tracks for the rest are TODO. Cards without a `backendId` render
// as preview tiles and can't be selected, so a player can never start a
// scenario whose mechanics aren't ported.

export type RouteColor = "green" | "yellow" | "red" | "black";

export interface ScenarioCard {
  slug: string;
  airportCode: string;
  airportName: string;
  city: string;
  country: string;
  airportColor: RouteColor;
  altitudeColor: RouteColor;
  /** Backend scenario id to send when starting. `undefined` = preview / locked. */
  backendId?: string;
}

export const SCENARIO_CARDS: ScenarioCard[] = [
  // ── Green route ────────────────────────────────────────────────────
  {
    slug: "yul-green",
    airportCode: "YUL",
    airportName: "Montréal–Trudeau International",
    city: "Montréal",
    country: "Canada",
    airportColor: "green",
    altitudeColor: "green",
    backendId: "yul-montreal",
  },
  {
    slug: "lhr-green",
    airportCode: "LHR",
    airportName: "Heathrow",
    city: "London",
    country: "United Kingdom",
    airportColor: "green",
    altitudeColor: "green",
  },
  {
    slug: "hnd-green",
    airportCode: "HND",
    airportName: "Tokyo Haneda",
    city: "Tokyo",
    country: "Japan",
    airportColor: "green",
    altitudeColor: "green",
  },
  {
    slug: "osl-green",
    airportCode: "OSL",
    airportName: "Oslo Gardermoen",
    city: "Oslo",
    country: "Norway",
    airportColor: "green",
    altitudeColor: "green",
  },
  {
    slug: "atl-green",
    airportCode: "ATL",
    airportName: "Hartsfield–Jackson Atlanta International",
    city: "Atlanta",
    country: "United States",
    airportColor: "green",
    altitudeColor: "green",
  },
  {
    slug: "prg-green",
    airportCode: "PRG",
    airportName: "Václav Havel Airport Prague",
    city: "Prague",
    country: "Czechia",
    airportColor: "green",
    altitudeColor: "green",
  },

  // ── Yellow route ───────────────────────────────────────────────────
  {
    slug: "lhr-yellow",
    airportCode: "LHR",
    airportName: "Heathrow",
    city: "London",
    country: "United Kingdom",
    airportColor: "yellow",
    altitudeColor: "yellow",
  },
  {
    slug: "tgu-yellow",
    airportCode: "TGU",
    airportName: "Toncontín International",
    city: "Tegucigalpa",
    country: "Honduras",
    airportColor: "yellow",
    altitudeColor: "yellow",
  },
  {
    slug: "gig-yellow",
    airportCode: "GIG",
    airportName: "Rio de Janeiro–Galeão",
    city: "Rio de Janeiro",
    country: "Brazil",
    airportColor: "yellow",
    altitudeColor: "yellow",
  },
  {
    slug: "kef-yellow",
    airportCode: "KEF",
    airportName: "Keflavík International",
    city: "Reykjavík",
    country: "Iceland",
    airportColor: "yellow",
    altitudeColor: "yellow",
  },
  {
    slug: "prg-yellow",
    airportCode: "PRG",
    airportName: "Václav Havel Airport Prague",
    city: "Prague",
    country: "Czechia",
    airportColor: "yellow",
    altitudeColor: "yellow",
  },
  {
    slug: "kul-yellow",
    airportCode: "KUL",
    airportName: "Kuala Lumpur International",
    city: "Kuala Lumpur",
    country: "Malaysia",
    airportColor: "yellow",
    altitudeColor: "yellow",
  },
  {
    slug: "atl-yellow",
    airportCode: "ATL",
    airportName: "Hartsfield–Jackson Atlanta International",
    city: "Atlanta",
    country: "United States",
    airportColor: "yellow",
    altitudeColor: "yellow",
  },

  // ── Red route ──────────────────────────────────────────────────────
  {
    slug: "pbh-red",
    airportCode: "PBH",
    airportName: "Paro International",
    city: "Paro",
    country: "Bhutan",
    airportColor: "red",
    altitudeColor: "red",
  },
  {
    slug: "hnd-red",
    airportCode: "HND",
    airportName: "Tokyo Haneda",
    city: "Tokyo",
    country: "Japan",
    airportColor: "red",
    altitudeColor: "red",
  },
  {
    slug: "gig-red",
    airportCode: "GIG",
    airportName: "Rio de Janeiro–Galeão",
    city: "Rio de Janeiro",
    country: "Brazil",
    airportColor: "red",
    altitudeColor: "red",
  },
  {
    slug: "osl-red",
    airportCode: "OSL",
    airportName: "Oslo Gardermoen",
    city: "Oslo",
    country: "Norway",
    airportColor: "red",
    altitudeColor: "red",
  },
  {
    slug: "tgu-red",
    airportCode: "TGU",
    airportName: "Toncontín International",
    city: "Tegucigalpa",
    country: "Honduras",
    airportColor: "red",
    altitudeColor: "red",
  },

  // ── Black route ────────────────────────────────────────────────────
  {
    slug: "kef-black",
    airportCode: "KEF",
    airportName: "Keflavík International",
    city: "Reykjavík",
    country: "Iceland",
    airportColor: "black",
    altitudeColor: "black",
  },
  {
    slug: "kul-black",
    airportCode: "KUL",
    airportName: "Kuala Lumpur International",
    city: "Kuala Lumpur",
    country: "Malaysia",
    airportColor: "black",
    altitudeColor: "black",
  },
  {
    slug: "pbh-black",
    airportCode: "PBH",
    airportName: "Paro International",
    city: "Paro",
    country: "Bhutan",
    airportColor: "black",
    altitudeColor: "black",
  },
];

export const ROUTE_ORDER: RouteColor[] = ["green", "yellow", "red", "black"];

export interface RouteTheme {
  label: string;
  blurb: string;
  /** Hex used for the card's left accent stripe and the colored dots. */
  hex: string;
  /** Tailwind classes for the route header pill. */
  pill: string;
  /** Tailwind classes for the route's small colored dots in the card. */
  dot: string;
  /** Soft glow used by the selection ring. */
  ring: string;
}

export const ROUTE_THEMES: Record<RouteColor, RouteTheme> = {
  green: {
    label: "Routine Landing",
    blurb: "Introductory approach corridors with generous rerolls.",
    hex: "#10b981",
    pill: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30",
    dot: "bg-emerald-500",
    ring: "shadow-emerald-500/30",
  },
  yellow: {
    label: "Exceptional Conditions",
    blurb: "Tighter timing windows and busier approach traffic.",
    hex: "#f59e0b",
    pill: "bg-amber-500/15 text-amber-200 ring-amber-400/30",
    dot: "bg-amber-500",
    ring: "shadow-amber-500/30",
  },
  red: {
    label: "Elite Pilots Only",
    blurb: "Hostile geometry — every die placement matters.",
    hex: "#ef4444",
    pill: "bg-rose-500/15 text-rose-200 ring-rose-400/30",
    dot: "bg-rose-500",
    ring: "shadow-rose-500/30",
  },
  black: {
    label: "Heroic Landing",
    blurb: "Limit-pushing routes for veteran crews.",
    hex: "#94a3b8",
    pill: "bg-slate-500/20 text-fg-primary ring-white/10",
    dot: "bg-slate-300",
    ring: "shadow-slate-400/30",
  },
};
