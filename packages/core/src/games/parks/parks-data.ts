import type { Park, ResourceBag, ResourceType } from "./types";
import { emptyBag } from "./types";

const LETTER_TO_RESOURCE: Record<string, ResourceType> = {
  m: "M",
  f: "F",
  s: "S",
  w: "W",
  a: "A",
};

function parseLetterString(s: string): ResourceBag {
  const bag = emptyBag();
  for (const ch of s) {
    const r = LETTER_TO_RESOURCE[ch];
    if (r) bag[r] += 1;
  }
  return bag;
}

interface ParkSpec {
  id: number;
  name: string;
  pt: number;
  costStr: string;
  refundStr: string;
}

const PARK_SPECS: ParkSpec[] = [
  { id: 1, name: "Kobuk Valley", pt: 3, costStr: "fssw", refundStr: "c" },
  { id: 2, name: "Indiana Dunes", pt: 3, costStr: "msww", refundStr: "a" },
  { id: 3, name: "Channel Islands", pt: 3, costStr: "mwww", refundStr: "ss" },
  { id: 4, name: "Death Valley", pt: 3, costStr: "ssss", refundStr: "" },
  { id: 5, name: "Acadia", pt: 4, costStr: "fwa", refundStr: "" },
  { id: 6, name: "Bryce Canyon", pt: 7, costStr: "mmmmss", refundStr: "" },
  { id: 7, name: "Petrified Forest", pt: 4, costStr: "ffss", refundStr: "" },
  { id: 8, name: "Katmai", pt: 3, costStr: "wa", refundStr: "" },
  { id: 9, name: "Gates of the Arctic", pt: 3, costStr: "sssw", refundStr: "" },
  { id: 10, name: "Yellowstone", pt: 6, costStr: "sswwwa", refundStr: "" },
  { id: 11, name: "Joshua Tree", pt: 3, costStr: "fsss", refundStr: "ww" },
  { id: 12, name: "Kings Canyon", pt: 4, costStr: "mffw", refundStr: "ss" },
  { id: 13, name: "Arches", pt: 3, costStr: "mss", refundStr: "" },
  { id: 14, name: "Great Sand Dunes", pt: 6, costStr: "mmmsss", refundStr: "w" },
  { id: 15, name: "Wrangell-St. Elias", pt: 7, costStr: "ffffww", refundStr: "" },
  { id: 16, name: "Grand Canyon", pt: 7, costStr: "mmmmf", refundStr: "" },
  { id: 17, name: "Gateway Arch", pt: 2, costStr: "sss", refundStr: "ww" },
  { id: 18, name: "Glacier", pt: 4, costStr: "mmsw", refundStr: "b" },
  { id: 19, name: "Mammoth Cave", pt: 3, costStr: "mm", refundStr: "" },
  { id: 20, name: "Mount Rainier", pt: 5, costStr: "mfffw", refundStr: "a" },
  { id: 21, name: "Denali", pt: 6, costStr: "mfssww", refundStr: "" },
  { id: 22, name: "Biscayne", pt: 3, costStr: "ffw", refundStr: "c" },
  { id: 23, name: "Isle Royale", pt: 2, costStr: "fw", refundStr: "c" },
  { id: 24, name: "Virgin Islands", pt: 4, costStr: "sswa", refundStr: "" },
  { id: 25, name: "Saguaro", pt: 3, costStr: "fss", refundStr: "" },
  { id: 26, name: "Kenai Fjords", pt: 5, costStr: "mmmfw", refundStr: "ss" },
  { id: 27, name: "Grand Teton", pt: 3, costStr: "mfs", refundStr: "(mfacssww)/6" },
  { id: 28, name: "Olympic", pt: 4, costStr: "fffs", refundStr: "(mfacssww)/6" },
  { id: 29, name: "Theodore Roosevelt", pt: 5, costStr: "mfffs", refundStr: "ww" },
  { id: 30, name: "New River Gorge", pt: 5, costStr: "fsswww", refundStr: "c" },
  { id: 31, name: "Wind Cave", pt: 4, costStr: "fffw", refundStr: "b" },
  { id: 32, name: "Great Basin", pt: 4, costStr: "mmfs", refundStr: "ww" },
  { id: 33, name: "North Cascades", pt: 7, costStr: "mffwwww", refundStr: "" },
  { id: 34, name: "Canyonlands", pt: 3, costStr: "mms", refundStr: "a" },
  { id: 35, name: "Hawaii Volcanoes", pt: 4, costStr: "mmmw", refundStr: "(mfacssww)/6" },
  { id: 36, name: "Shenandoah", pt: 4, costStr: "ffsw", refundStr: "b" },
  { id: 37, name: "Haleakala", pt: 5, costStr: "mmmm", refundStr: "" },
  { id: 38, name: "Dry Tortugas", pt: 2, costStr: "www", refundStr: "ss" },
  { id: 39, name: "Hot Springs", pt: 3, costStr: "swww", refundStr: "" },
  { id: 40, name: "Great Smoky Mountains", pt: 7, costStr: "mmffsw", refundStr: "" },
  { id: 41, name: "Cuyahoga", pt: 3, costStr: "fww", refundStr: "" },
  { id: 42, name: "American Samoa", pt: 6, costStr: "fsssa", refundStr: "" },
  { id: 43, name: "Mesa Verde", pt: 6, costStr: "mmmfs", refundStr: "" },
  { id: 44, name: "Congaree", pt: 3, costStr: "ff", refundStr: "" },
  { id: 45, name: "Lake Clark", pt: 3, costStr: "mww", refundStr: "" },
  { id: 46, name: "Glacier Bay", pt: 6, costStr: "mwwwa", refundStr: "" },
  { id: 47, name: "Badlands", pt: 7, costStr: "mmfssss", refundStr: "" },
  { id: 48, name: "Guadalupe Mountains", pt: 4, costStr: "msa", refundStr: "" },
  { id: 49, name: "Voyageurs", pt: 6, costStr: "fffwww", refundStr: "s" },
  { id: 50, name: "Rocky Mountain", pt: 6, costStr: "mfssww", refundStr: "" },
  { id: 51, name: "Big Bend", pt: 5, costStr: "msssww", refundStr: "a" },
  { id: 52, name: "Capitol Reef", pt: 5, costStr: "mfsw", refundStr: "" },
  { id: 53, name: "Crater Lake", pt: 3, costStr: "mfw", refundStr: "b" },
  { id: 54, name: "Everglades", pt: 3, costStr: "wwww", refundStr: "" },
  { id: 55, name: "Redwood", pt: 7, costStr: "mffff", refundStr: "" },
  { id: 56, name: "Pinnacles", pt: 4, costStr: "mmms", refundStr: "(mfacssww)/6" },
  { id: 57, name: "Carlsbad Caverns", pt: 2, costStr: "ms", refundStr: "a" },
  { id: 58, name: "White Sands", pt: 3, costStr: "sa", refundStr: "" },
  { id: 59, name: "Sequoia", pt: 5, costStr: "ffff", refundStr: "" },
  { id: 60, name: "Zion", pt: 4, costStr: "mmm", refundStr: "" },
  { id: 61, name: "Lassen Volcanic", pt: 4, costStr: "fff", refundStr: "" },
  { id: 62, name: "Yosemite", pt: 6, costStr: "mfswa", refundStr: "" },
  { id: 63, name: "Black Canyon", pt: 4, costStr: "mmww", refundStr: "" },
];

/**
 * Refund encoding details:
 *  - "" — nothing
 *  - "c" — gain 1 canteen (camping reward)
 *  - "b" — gain 1 photo (shutterbug)
 *  - sequence of m/f/s/w/a — gain those resources
 *  - "(mfacssww)/6" — end-game bonus, encoded into Park.endGameDividedBonus
 *
 * Camping (c) and shutterbug (b) yield concrete rewards in the simplified
 * implementation: c → take a canteen; b → gain a photo.
 *
 * A modeled "refund" in `Park.refund` is only the M/F/S/W/A immediate gain.
 * Canteen/photo refunds are handled separately by the game engine because they
 * involve drawing from external pools.
 */
export interface ParkRefundExtras {
  canteens: number;
  photos: number;
}

function parseRefund(s: string): {
  bag: ResourceBag;
  extras: ParkRefundExtras;
  endGameBonus?: Park["endGameDividedBonus"];
} {
  const bag = emptyBag();
  const extras: ParkRefundExtras = { canteens: 0, photos: 0 };
  if (!s) return { bag, extras };
  if (s.startsWith("(")) {
    const close = s.indexOf(")");
    const inner = s.slice(1, close);
    const divisor = Number.parseInt(s.slice(close + 2), 10);
    return { bag, extras, endGameBonus: { letters: parseLetterString(inner), divisor } };
  }
  for (const ch of s) {
    if (ch === "c") extras.canteens += 1;
    else if (ch === "b") extras.photos += 1;
    else {
      const r = LETTER_TO_RESOURCE[ch];
      if (r) bag[r] += 1;
    }
  }
  return { bag, extras };
}

const PARK_EXTRAS = new Map<number, ParkRefundExtras>();

export const ALL_PARKS: Park[] = PARK_SPECS.map((spec) => {
  const cost = parseLetterString(spec.costStr);
  const { bag: refund, extras, endGameBonus } = parseRefund(spec.refundStr);
  PARK_EXTRAS.set(spec.id, extras);
  const park: Park = {
    id: spec.id,
    name: spec.name,
    pt: spec.pt,
    cost,
    refund,
  };
  if (endGameBonus) park.endGameDividedBonus = endGameBonus;
  return park;
});

export function getParkExtras(parkId: number): ParkRefundExtras {
  return PARK_EXTRAS.get(parkId) ?? { canteens: 0, photos: 0 };
}

export function getParkById(id: number): Park | undefined {
  return ALL_PARKS.find((p) => p.id === id);
}
