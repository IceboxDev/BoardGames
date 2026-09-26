// ---------------------------------------------------------------------------
// The 50 Mission tiles, transcribed from the physical set (left-to-right,
// top-to-bottom). Gold = Instant (discard on your turn for an effect; worth
// nothing at the end). White title = eligible as a Rookie Public Mission.
// 5+ = removed in 2–4 player games; those ten duplicate ordinary tiles.
// ---------------------------------------------------------------------------

import type { MissionDef } from "../types";

const INSTANT: MissionDef[] = [
  {
    id: "digestion",
    name: "Digestion",
    vp: 0,
    instant: { kind: "digest-hand" },
    text: "Discard to skip your turn: Digest all Humans from your hand and discard the others.",
  },
  {
    id: "hungry",
    name: "Hungry!",
    vp: 0,
    instant: { kind: "free-hunt-after-col3" },
    text: "Discard if you hunt a card in column 3 to hunt another card on the Hunt Track for free.",
  },
  {
    id: "vampire-on-top",
    name: "Vampire on Top",
    vp: 0,
    instant: { kind: "free-hunt-same-column", region: "mountains" },
    text: "Discard if you hunt a Human in the Mountains to hunt 1 card in the same column for free.",
  },
  {
    id: "treasure-chest",
    name: "Treasure Chest",
    vp: 0,
    instant: { kind: "take-bonus" },
    text: "Discard to take any Bonus token on the board.",
  },
  {
    id: "wild-vampire",
    name: "Wild Vampire",
    vp: 0,
    instant: { kind: "free-hunt-same-column", region: "forest" },
    text: "Discard if you hunt a Human in the Forest to hunt 1 card in the same column for free.",
  },
  {
    id: "beast-master",
    name: "Beast Master",
    vp: 0,
    instant: { kind: "free-familiar" },
    text: "Discard to hunt 1 Familiar for free and add it to your playing area.",
  },
  {
    id: "vampire-of-the-coast",
    name: "Vampire of the Coast",
    vp: 0,
    instant: { kind: "free-hunt-same-column", region: "plains" },
    text: "Discard if you hunt a Human in the Plains to hunt 1 card in the same column for free.",
  },
  {
    id: "the-opportunist",
    name: "The Opportunist",
    vp: 0,
    instant: { kind: "vp-per-closer" },
    text: "Discard to gain 1 VP for each Vampire closer to the Castle than you are.",
  },
];

const WHITE: MissionDef[] = [
  {
    id: "common-taste",
    name: "Common Taste",
    vp: 0,
    whiteTitle: true,
    standard: { kind: "per-category", category: "villager", vpEach: 1 },
    text: "1 VP for each Villager you have hunted.",
  },
  {
    id: "zoologist",
    name: "Zoologist",
    vp: 4,
    whiteTitle: true,
    standard: { kind: "majority", of: "familiars" },
    text: "4 VP if you have hunted more Familiars than each of the other Vampires.",
  },
  {
    id: "the-devout",
    name: "The Devout",
    vp: 6,
    whiteTitle: true,
    standard: { kind: "majority", of: "religious" },
    text: "6 VP if you have hunted more Religious Humans than each of the other Vampires.",
  },
  {
    id: "romantic",
    name: "Romantic",
    vp: 5,
    whiteTitle: true,
    standard: { kind: "has-rose" },
    text: "5 VP if you have hunted a Rose.",
  },
  {
    id: "a-soldiers-life",
    name: "A Soldier's Life",
    vp: 0,
    whiteTitle: true,
    standard: { kind: "per-category", category: "military", vpEach: 1 },
    text: "1 VP for each Military Human you have hunted.",
  },
  {
    id: "the-host",
    name: "The Host",
    vp: 2,
    whiteTitle: true,
    standard: { kind: "host", perBeaten: 2 },
    text: "2 VP if you come back to the Castle, +2 VP for each Vampire you beat back home.",
  },
  {
    id: "the-collector",
    name: "The Collector",
    vp: 0,
    whiteTitle: true,
    standard: { kind: "per-bonus", vpEach: 1 },
    text: "1 VP for each Bonus token you have collected.",
  },
  {
    id: "haute-cuisine",
    name: "Haute Cuisine",
    vp: 0,
    whiteTitle: true,
    standard: { kind: "per-human-worth", min: 4, vpEach: 1 },
    text: "1 VP for each Human you have hunted that is worth 4+ VP.",
  },
];

const PICKY: MissionDef = {
  id: "picky",
  name: "Picky",
  vp: 6,
  standard: { kind: "none-worth", atLeast: 5 },
  text: "6 VP if you haven't hunted any Humans who are worth 5+ VP.",
};
const STRATEGIST: MissionDef = {
  id: "strategist",
  name: "Strategist",
  vp: 6,
  standard: { kind: "majority", of: "military" },
  text: "6 VP if you have hunted more Military Humans than each of the other Vampires.",
};
const HOLIER: MissionDef = {
  id: "holier-than-thou",
  name: "Holier than Thou",
  vp: 0,
  standard: { kind: "per-category", category: "religious", vpEach: 1 },
  text: "1 VP for each Religious Human you have hunted.",
};
const ROYAL: MissionDef = {
  id: "royal",
  name: "Royal",
  vp: 0,
  standard: { kind: "per-category", category: "noble", vpEach: 1 },
  text: "1 VP for each Noble Human you have hunted.",
};
const GLUTTONY: MissionDef = {
  id: "gluttony",
  name: "Gluttony",
  vp: 5,
  standard: { kind: "majority", of: "humans" },
  text: "5 VP if you have hunted more Humans than each of the other Vampires.",
};
const EAT_THEM_ALL: MissionDef = {
  id: "eat-them-all",
  name: "Eat Them All",
  vp: 5,
  standard: { kind: "count-humans", atLeast: 13 },
  text: "5 VP if you have hunted at least 13 Humans.",
};
const THREE_STAR: MissionDef = {
  id: "three-star-dinner",
  name: "Three-Star Dinner",
  vp: 0,
  standard: { kind: "per-human-worth", min: 3, max: 3, vpEach: 1 },
  text: "1 VP for each Human you have hunted that is worth 3 VP.",
};
const MEH: MissionDef = {
  id: "meh",
  name: "Meh",
  vp: 0,
  standard: { kind: "per-human-worth", min: 1, max: 2, vpEach: 1 },
  text: "1 VP for each Human you have hunted that is worth 1 or 2 VP.",
};

const STANDARD: MissionDef[] = [
  PICKY,
  STRATEGIST,
  {
    id: "a-hankering",
    name: "A Hankering",
    vp: 6,
    standard: { kind: "same-type", atLeast: 5 },
    text: "6 VP if you have hunted 5 or more Humans of the same type (limited to one type).",
  },
  {
    id: "on-a-diet",
    name: "On a Diet",
    vp: 5,
    standard: { kind: "fewest-humans" },
    text: "5 VP if you have hunted fewer Humans than each of the other Vampires.",
  },
  {
    id: "tipsy",
    name: "Tipsy",
    vp: 0,
    standard: { kind: "per-keyword", keywords: ["confuse"], vpEach: 4 },
    text: "4 VP for each Human you have hunted with Confuse.",
  },
  {
    id: "my-body-is-my-temple",
    name: "My Body Is My Temple",
    vp: 0,
    standard: { kind: "per-distinct", type: "power", vpEach: 1 },
    text: "1 VP for each different Power card you have hunted.",
  },
  HOLIER,
  {
    id: "selective",
    name: "Selective",
    vp: 0,
    standard: { kind: "least-type", vpEach: 2 },
    text: "2 VP for each Human of the type you have hunted the least of (can be 0).",
  },
  ROYAL,
  {
    id: "rich-get-richer",
    name: "Rich Get Richer",
    vp: 4,
    standard: { kind: "score-rank", rank: "highest" },
    text: "4 VP if you have the highest score before Missions are scored.",
  },
  GLUTTONY,
  {
    id: "animal-lover",
    name: "Animal Lover",
    vp: 0,
    standard: { kind: "per-distinct", type: "familiar", vpEach: 1 },
    text: "1 VP for each different Familiar card you have hunted.",
  },
  EAT_THEM_ALL,
  {
    id: "revolutionary",
    name: "Revolutionary",
    vp: 6,
    standard: { kind: "majority", of: "noble" },
    text: "6 VP if you have hunted more Noble Humans than each of the other Vampires.",
  },
  {
    id: "missionary",
    name: "Missionary",
    vp: 0,
    standard: { kind: "missionary" },
    text: "1 VP for each Mission you have that scores at least 1 VP (including this one).",
  },
  {
    id: "landlord",
    name: "Landlord",
    vp: 6,
    standard: { kind: "majority", of: "villager" },
    text: "6 VP if you have hunted more Villager Humans than each of the other Vampires.",
  },
  {
    id: "dangerous-diet",
    name: "Dangerous Diet",
    vp: 0,
    standard: { kind: "per-keyword", keywords: ["confuse", "spicy", "holy-water"], vpEach: 2 },
    text: "2 VP for each Human you have hunted with Confuse, Spicy or Holy Water.",
  },
  {
    id: "varied-diet",
    name: "Varied Diet",
    vp: 0,
    standard: { kind: "sets", vpEach: 3 },
    text: "3 VP for each set of 1 Human of each type you have hunted (cumulative).",
  },
  {
    id: "gourmet",
    name: "Gourmet",
    vp: 0,
    standard: { kind: "per-digested", vpEach: 2 },
    text: "2 VP for each Human you have digested.",
  },
  THREE_STAR,
  {
    id: "family-business",
    name: "Family Business",
    vp: 0,
    standard: { kind: "most-type", vpEach: 1 },
    text: "1 VP for each Human of the type you have hunted the most of.",
  },
  {
    id: "catch-up",
    name: "Catch Up",
    vp: 10,
    standard: { kind: "score-rank", rank: "lowest" },
    text: "10 VP if you have the lowest score before Missions are scored.",
  },
  MEH,
  {
    id: "early-night",
    name: "Early Night",
    vp: 6,
    standard: { kind: "first-home" },
    text: "6 VP if you are the first one to get back to the Castle.",
  },
];

/** The ten 5+ tiles duplicate ordinary ones. */
const FIVE_PLUS: MissionDef[] = [
  WHITE.find((m) => m.id === "haute-cuisine"),
  THREE_STAR,
  GLUTTONY,
  PICKY,
  HOLIER,
  EAT_THEM_ALL,
  WHITE.find((m) => m.id === "a-soldiers-life"),
  ROYAL,
  MEH,
  WHITE.find((m) => m.id === "common-taste"),
].map((m) => {
  if (!m) throw new Error("5+ tile duplicates a missing Mission");
  // A 5+ copy is never a white-title (Rookie public) tile.
  return { ...m, id: `${m.id}-5p`, fivePlus: true, whiteTitle: undefined };
});

export const MISSIONS: readonly MissionDef[] = [...INSTANT, ...WHITE, ...STANDARD, ...FIVE_PLUS];

export const MISSION_DEFS: ReadonlyMap<string, MissionDef> = new Map(
  MISSIONS.map((m) => [m.id, m]),
);

export function missionDef(id: string): MissionDef {
  const def = MISSION_DEFS.get(id);
  if (!def) throw new Error(`Unknown mission ${id}`);
  return def;
}
