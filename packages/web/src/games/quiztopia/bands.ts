// The twelve categories as the app draws them: each is a *district* of the
// city with a building, a band tone and a two-digit label. The physical
// cards' three bands (pink / blue / sand) map onto the design system's
// themeable tones (rose / sky / amber), so nothing here needs a new colour
// token and every primitive already knows how to render the band.

import {
  type CategoryBand,
  QUIZTOPIA_CATEGORIES,
  type QuiztopiaCategory,
} from "@boardgames/core/games/quiztopia/categories";
import type { CoreTone } from "../../components/ui";

export type BandTone = Extract<CoreTone, "rose" | "sky" | "amber">;

export const BAND_TONE: Record<CategoryBand, BandTone> = {
  pink: "rose",
  blue: "sky",
  sand: "amber",
};

export type BuildingName =
  | "opera-house"
  | "library"
  | "museum"
  | "cinema"
  | "stadium"
  | "town-hall"
  | "exchange"
  | "temple"
  | "laboratory"
  | "observatory"
  | "greenhouse"
  | "data-centre";

const BUILDINGS: readonly { name: BuildingName; label: string; labelDe: string }[] = [
  { name: "opera-house", label: "Opera House", labelDe: "Opernhaus" },
  { name: "library", label: "Library", labelDe: "Bibliothek" },
  { name: "museum", label: "Museum", labelDe: "Museum" },
  { name: "cinema", label: "Cinema", labelDe: "Kino" },
  { name: "stadium", label: "Stadium", labelDe: "Stadion" },
  { name: "town-hall", label: "Town Hall", labelDe: "Rathaus" },
  { name: "exchange", label: "Exchange", labelDe: "Börse" },
  { name: "temple", label: "Temple", labelDe: "Tempel" },
  { name: "laboratory", label: "Laboratory", labelDe: "Labor" },
  { name: "observatory", label: "Observatory", labelDe: "Sternwarte" },
  { name: "greenhouse", label: "Greenhouse", labelDe: "Gewächshaus" },
  { name: "data-centre", label: "Data Centre", labelDe: "Rechenzentrum" },
];

export interface District extends QuiztopiaCategory {
  /** 0-based building index (the engine's `buildingIndex`). */
  index: number;
  /** Two-digit label printed beside the glyph ("07"). */
  label: string;
  tone: BandTone;
  building: BuildingName;
  buildingLabel: string;
  buildingLabelDe: string;
}

export const DISTRICTS: readonly District[] = QUIZTOPIA_CATEGORIES.map((c, i) => ({
  ...c,
  index: i,
  label: String(c.n).padStart(2, "0"),
  tone: BAND_TONE[c.band],
  building: BUILDINGS[i].name,
  buildingLabel: BUILDINGS[i].label,
  buildingLabelDe: BUILDINGS[i].labelDe,
}));

export function districtByIndex(index: number): District {
  const d = DISTRICTS[index];
  if (!d) throw new Error(`no district at index ${index}`);
  return d;
}

export function districtByN(n: number): District {
  return districtByIndex(n - 1);
}

export function districtBySlug(slug: string): District | undefined {
  return DISTRICTS.find((d) => d.slug === slug);
}

/** Thin coloured strip along a card's top edge. */
export const TONE_STRIP: Record<BandTone, string> = {
  rose: "bg-rose-400",
  sky: "bg-sky-400",
  amber: "bg-amber-400",
};

/** Answer highlight inside running text. */
export const TONE_MARK: Record<BandTone, string> = {
  rose: "bg-rose-400/25",
  sky: "bg-sky-400/25",
  amber: "bg-amber-400/25",
};

/** A lit building's edge treatment. */
export const TONE_LIT: Record<BandTone, string> = {
  rose: "border-rose-400/40 shadow-glow-rose",
  sky: "border-sky-400/40 shadow-glow-sky",
  amber: "border-amber-400/40 shadow-glow-amber",
};

export const TONE_SKY: Record<BandTone, string> = {
  rose: "bg-rose-400/15",
  sky: "bg-sky-400/15",
  amber: "bg-amber-400/15",
};
