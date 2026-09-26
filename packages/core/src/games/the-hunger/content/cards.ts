// ---------------------------------------------------------------------------
// Card list. REAL (transcribed from the cards): the Starting deck, the three
// Roses, the 22 Familiars, the 80 Humans and the 20 Powers.
// ---------------------------------------------------------------------------

import type { CardDef, HumanCategory, Keyword, PassiveEffect } from "../types";

/** The card id: the name, lower-cased, accents and punctuation dropped. */
function slug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const SPICY_TEXT =
  "Spicy: spend your Speed moving to the nearest Well. End of turn: discard this card if you are on a Well.";

function human(
  name: string,
  category: HumanCategory,
  speed: number,
  vp: number,
  extra: Partial<CardDef> = {},
): CardDef {
  return {
    id: slug(name),
    name,
    type: "human",
    category,
    vp,
    speed,
    copies: 1,
    keywords: [],
    ...extra,
  };
}

const A = { rookie: true } as const;
const kw = (...keywords: Keyword[]) => ({ keywords });
const spicy = { keywords: ["permanent", "spicy"] as Keyword[], text: SPICY_TEXT };
const digestOnHunt = {
  onHunt: { kind: "digest-any" } as const,
  text: "When you hunt this card, you may digest 1 card from your playing area or discard pile.",
};
const huntedIn = (region: "plains" | "forest", vp: number) => ({
  huntBonus: { region, vp },
  text: `+${vp} VP if you hunt this card in the ${region === "plains" ? "Plains" : "Forest"}.`,
});
/** The "X" Humans: 1 VP at the end per Human of their type, themselves included. */
const perType = (category: HumanCategory) => ({
  endGame: { kind: "per-category", category, vp: 1 } as const,
  text: `End of game: 1 VP for each ${category === "religious" ? "Religious" : category[0].toUpperCase() + category.slice(1)} Human you have hunted.`,
});

/** The 80 Humans, transcribed from the real cards: 20 per type, one copy each. */
export const HUMANS: readonly CardDef[] = [
  // Nobles
  human("Carlyle", "noble", 0, 4, A),
  human("Ophelia", "noble", 0, 4, A),
  human("Tania", "noble", 0, 5),
  human("Mindy", "noble", 0, 1),
  human("Jack", "noble", 0, 3),
  human("Eloïs", "noble", 0, 4, kw("holy-water")),
  human("Agnès", "noble", 0, 1),
  human("Prince Godfrey", "noble", 0, 5),
  human("Wilma", "noble", 0, 3, kw("gregarious")),
  human("Theresa", "noble", 0, 4, kw("confuse")),
  human("Wentworth", "noble", 0, 5),
  human("Veres", "noble", 0, 0, perType("noble")),
  human("Wadsworth", "noble", -1, 3),
  human("Henrietta", "noble", 0, 5),
  human("Baron Christien", "noble", 0, 4, {
    endGame: { kind: "if-has", other: "roxane", vp: 2 },
    text: "End of game: 2 VP if you have Roxane.",
  }),
  human("Catarina", "noble", 0, 4, kw("gregarious")),
  human("Marilyn", "noble", 0, 2),
  human("Bridget", "noble", 0, 2, huntedIn("plains", 1)),
  human("Zara", "noble", 0, 3),
  human("Belle", "noble", 0, 3, huntedIn("forest", 2)),
  // Religious
  human("Eleanor", "religious", 0, 3, A),
  human("Dee", "religious", 0, 0, {
    ...A,
    manipulation: { kind: "draw", n: 1, mandatory: true },
    text: "Draw 1 card.",
  }),
  human("Bolat", "religious", 0, 1, kw("holy-water")),
  human("Faith", "religious", 0, 2, huntedIn("plains", 1)),
  human("Rufus", "religious", 0, 1, spicy),
  human("Ruth", "religious", 0, 1),
  human("The Priestess", "religious", 0, 5),
  human("Bradford", "religious", 0, 4),
  human("Mary", "religious", 0, 3),
  human("Zephania", "religious", 0, 5, digestOnHunt),
  human("Brother Stewart", "religious", 0, 3),
  human("Wright", "religious", 0, 4, kw("inspiring")),
  human("Father Eli", "religious", 0, 3, kw("slow")),
  human("Cotton", "religious", 0, 3),
  human("Cantor Sami", "religious", 0, 4, kw("holy-water")),
  human("Ozmo", "religious", 0, 2),
  human("Mycroft", "religious", 0, 2),
  human("Simone", "religious", 0, 4),
  human("Nemes", "religious", -1, 0, perType("religious")),
  human("Friar Tunk", "religious", 0, 2),
  // Villagers
  human("Momo", "villager", 1, 1, A),
  human("Billy", "villager", 1, 1, A),
  human("Bruce", "villager", 1, 1, A),
  human("Roxane", "villager", 0, 3),
  human("Bippo", "villager", 0, 1, kw("confuse")),
  human("Reyda", "villager", 0, 1, kw("fast")),
  human("Éponime", "villager", 0, 2),
  human("Boo", "villager", 1, 1),
  human("O'Nel", "villager", 0, 1),
  human("Patricia", "villager", 0, 2, kw("slow")),
  human("Juri", "villager", 0, 3, kw("confuse")),
  human("Favina", "villager", 0, 3),
  human("Yaga", "villager", -1, 2, kw("gregarious")),
  human("Anton", "villager", 0, 2, spicy),
  human("Szalai", "villager", 0, 0, perType("villager")),
  human("Eunice", "villager", 0, 3, spicy),
  human("Boris", "villager", 0, 2),
  human("Angus", "villager", 0, 4, digestOnHunt),
  human("Bernard", "villager", 0, 3, spicy),
  human("Ivo", "villager", 0, 2),
  // Military
  human("Uwe", "military", 0, 3, A),
  human("Grant", "military", 0, 4, A),
  human("Diego", "military", -1, 3),
  human("Campbell", "military", 0, 2, kw("confuse")),
  human("Calvin", "military", 0, 4, kw("fast")),
  human("Peter", "military", 0, 1, digestOnHunt),
  human("Khasar", "military", 0, 2),
  human("Marcel", "military", 0, 3, kw("holy-water")),
  human("Eli", "military", 0, 0, perType("military")),
  human("Tyre", "military", 0, 1),
  human("Églantine", "military", 0, 4, kw("confuse")),
  human("Ivan", "military", 0, 5),
  human("Murdoch", "military", 0, 1, huntedIn("forest", 2)),
  human("Cyrana", "military", 0, 3, {
    endGame: { kind: "if-has", other: "roxane", vp: 4 },
    text: "End of game: 4 VP if you have Roxane.",
  }),
  human("Isabel", "military", 0, 2, {
    endGame: { kind: "if-family", family: "rose", vp: 2 },
    text: "End of game: 2 VP if you have a Rose.",
  }),
  human("Arthur", "military", 0, 2),
  human("Harper", "military", 0, 2),
  human("Archibald", "military", 0, 3),
  human("Victoria", "military", 0, 2, kw("inspiring")),
  human("Titus", "military", 0, 4, spicy),
];

/**
 * The 22 Familiars, transcribed from the real cards: 22 unique names over
 * 10 effect templates, all Speed 0, Ready, Permanent. The four Echo-template
 * cards (Echo, Bo, Gray, Jahda) are the Wolves.
 */
type FamiliarName = readonly [id: string, name: string, rookie?: "A"];

function familiars(
  names: readonly FamiliarName[],
  text: string,
  extra: Partial<CardDef> = {},
): CardDef[] {
  return names.map(([id, name, rookie]) => ({
    id,
    name,
    type: "familiar",
    speed: 0,
    vp: 0,
    copies: 1,
    keywords: ["ready", "permanent"],
    text,
    ...(rookie ? { rookie: true } : {}),
    ...extra,
  }));
}

export const FAMILIARS: readonly CardDef[] = [
  ...familiars(
    [
      ["nanny", "Nanny"],
      ["capra", "Capra"],
    ],
    "2 VP for each Vampire you push; they must choose and discard 1 of their Permanent cards.",
    { passive: { kind: "push-tax", vp: 2 } },
  ),
  ...familiars(
    [
      ["echo", "Echo"],
      ["bo", "Bo"],
      ["gray", "Gray"],
      ["jahda", "Jahda"],
    ],
    "End of game: 1 VP for each Wolf you have.",
    { family: "wolf", endGame: { kind: "per-family", family: "wolf", vp: 1 } },
  ),
  ...familiars(
    [
      ["tyson", "Tyson"],
      ["porumbel", "Porumbel"],
    ],
    "1 VP at the end of turns where you don't hunt.",
    { passive: { kind: "end-turn-vp", n: 1, when: "not-hunted" } },
  ),
  ...familiars(
    [
      ["kutya", "Kutya", "A"],
      ["caine", "Caine"],
    ],
    "+1 Speed to hunt on Wells. Or discard this Familiar for an extra hunt in column 1.",
    { passive: { kind: "well-speed", n: 1 }, activated: { kind: "discard-for-col1-hunt" } },
  ),
  ...familiars(
    [
      ["chop", "Chop"],
      ["malac", "Malac", "A"],
    ],
    "1 VP if you hunt at least 1 Human. If you do not move, you may hunt an extra time.",
    { passive: [{ kind: "human-hunt-vp", n: 1 }, { kind: "stay-extra-hunt" }] },
  ),
  ...familiars(
    [
      ["sova", "Sova"],
      ["bagoly", "Bagoly", "A"],
    ],
    "Inspiring: gain 1 Mission when you hunt this card. 1 VP whenever you gain a Mission.",
    {
      keywords: ["inspiring", "ready", "permanent"],
      passive: { kind: "vp-per-mission", n: 1 },
    },
  ),
  ...familiars(
    [
      ["wee-vlad", "Wee Vlad"],
      ["patcani", "Patcani", "A"],
    ],
    "+1 Speed per Human worth 1 or 2 VP in your playing area.",
    { passive: { kind: "speed-per-human-worth", min: 1, max: 2, n: 1 } },
  ),
  ...familiars(
    [
      ["wiggles", "Wiggles"],
      ["kaa", "Kaa"],
    ],
    "You may digest this Familiar to digest 1 card from your playing area and gain 2 VP.",
    { activated: { kind: "digest-with-card", vp: 2 } },
  ),
  ...familiars(
    [
      ["ursa", "Ursa"],
      ["teddy", "Teddy"],
    ],
    "Before you play, you may discard your entire hand to draw 2 cards. If you do, gain 1 VP and discard this Familiar.",
    { activated: { kind: "redraw-hand", draw: 2, vp: 1 } },
  ),
  ...familiars(
    [
      ["lockjaw", "Lockjaw"],
      ["nanoosh", "Nanoosh", "A"],
    ],
    "1 VP and +2 Speed if you have 2+ Humans in your playing area.",
    { passive: { kind: "humans-bonus", atLeast: 2, speed: 2, vp: 1 } },
  ),
];

/** The 20 Powers, transcribed from the real cards (A = Rookie marker). */
export const POWERS: readonly CardDef[] = [
  {
    id: "hypnosis",
    name: "Hypnosis",
    type: "power",
    speed: 1,
    vp: 0,
    copies: 2,
    rookieCopies: 1,
    keywords: [],
    activated: { kind: "hypnosis" },
    text: "Move 1 card on the Hunt Track 1 space up, down, right or left.",
  },
  {
    id: "form-of-mist",
    name: "Form of Mist",
    type: "power",
    speed: 1,
    vp: 0,
    copies: 2,
    rookieCopies: 1,
    keywords: [],
    passive: { kind: "mist" },
    text: "You may teleport to the next Well in any direction instead of moving this turn.",
  },
  {
    id: "vampiric-will-double",
    name: "Vampiric Will",
    type: "power",
    speed: 0,
    vp: 0,
    copies: 1,
    keywords: [],
    manipulation: { kind: "discard-draw", times: 2 },
    text: "You may discard 1 card to draw 1 card, then you may discard 1 card to draw 1 card.",
  },
  {
    id: "vampiric-speed-2",
    name: "Vampiric Speed",
    type: "power",
    speed: 2,
    vp: 0,
    copies: 2,
    keywords: [],
  },
  {
    id: "vampiric-strength-great",
    name: "Vampiric Strength",
    type: "power",
    speed: -2,
    vp: 0,
    copies: 1,
    keywords: [],
    manipulation: { kind: "draw", n: 2, withHuman: 3 },
    text: "You may draw 2 cards, or 3 cards if you have at least 1 Human in your playing area.",
  },
  {
    id: "form-of-bat",
    name: "Form of Bat",
    type: "power",
    speed: 1,
    vp: 0,
    copies: 2,
    rookieCopies: 1,
    keywords: [],
    passive: { kind: "bat" },
    text: "When you move, you may skip spaces that contain Wells or Vampires.",
  },
  {
    id: "vampiric-will",
    name: "Vampiric Will",
    type: "power",
    speed: 1,
    vp: 0,
    copies: 3,
    rookie: true,
    keywords: [],
    manipulation: { kind: "discard-draw" },
    text: "You may discard 1 card to draw 1 card.",
  },
  {
    id: "vampiric-speed-3",
    name: "Vampiric Speed",
    type: "power",
    speed: 3,
    vp: 0,
    copies: 2,
    rookie: true,
    keywords: [],
  },
  {
    id: "vampiric-strength",
    name: "Vampiric Strength",
    type: "power",
    speed: 0,
    vp: 0,
    copies: 3,
    rookie: true,
    keywords: [],
    manipulation: { kind: "draw", n: 1, withHuman: 2 },
    text: "You may draw 1 card, or 2 cards if you have at least 1 Human in your playing area.",
  },
  {
    id: "vampiric-stealth",
    name: "Vampiric Stealth",
    type: "power",
    speed: 2,
    vp: 0,
    copies: 2,
    rookieCopies: 1,
    keywords: [],
    passive: { kind: "extra-hunt" },
    text: "You may hunt an extra time this turn.",
  },
];

/** The three Labyrinth Roses — transcribed from the real cards. */
export const ROSES: readonly CardDef[] = [
  {
    id: "eternal-rose",
    name: "Eternal Rose",
    type: "item",
    family: "rose",
    speed: 1,
    vp: 5,
    copies: 1,
    keywords: ["ready", "unique", "permanent"],
    passive: { kind: "end-turn-vp", n: 1, when: "always" },
    text: "1 VP at the end of each of your turns.",
  },
  {
    id: "dead-rose",
    name: "Dead Rose",
    type: "item",
    family: "rose",
    speed: 1,
    vp: 3,
    copies: 1,
    keywords: ["ready", "unique", "permanent"],
    passive: { kind: "end-turn-vp", n: 1, when: "hunted" },
    text: "1 VP at the end of turns in which you hunt.",
  },
  {
    id: "perfect-rose",
    name: "Perfect Rose",
    type: "item",
    family: "rose",
    speed: 0,
    vp: 5,
    copies: 1,
    keywords: ["ready", "unique", "permanent"],
    passive: { kind: "end-turn-vp", n: 2, when: "not-hunted" },
    text: "2 VP at the end of turns in which you do not hunt.",
  },
];

/** Starting deck — six golden "S" cards, identical for every Vampire. */
const vampireSpeed = (speed: number): CardDef => ({
  id: `vampire-speed-${speed}`,
  name: "Vampire Speed",
  type: "starting",
  speed,
  vp: 0,
  copies: 1,
  keywords: [],
});

export const STARTING: readonly CardDef[] = [
  {
    id: "s-the-hunger",
    name: "The Hunger",
    type: "starting",
    speed: 2,
    vp: 0,
    copies: 1,
    keywords: [],
    passive: { kind: "hunt-vp-per-human", n: 1 },
    text: "+1 VP for each Human you hunt this turn.",
  },
  vampireSpeed(4),
  vampireSpeed(2),
  {
    id: "vampire-thirst",
    name: "Vampire Thirst",
    type: "starting",
    speed: { base: 1, ifHuman: 3 },
    vp: 0,
    copies: 1,
    keywords: [],
    text: "Speed 3 instead if you have a Human in your playing area.",
  },
  {
    id: "s-vampire-strength",
    name: "Vampire Strength",
    type: "starting",
    speed: 2,
    vp: 0,
    copies: 1,
    keywords: [],
    manipulation: { kind: "draw", n: 0, withHuman: 1, mandatory: true },
    text: "Draw 1 card if you have a Human in your playing area.",
  },
  vampireSpeed(3),
];

export const HUNT_CARDS: readonly CardDef[] = [...HUMANS, ...FAMILIARS, ...POWERS];

const ALL: readonly CardDef[] = [...HUNT_CARDS, ...ROSES, ...STARTING];

export const CARD_DEFS: ReadonlyMap<string, CardDef> = new Map(ALL.map((c) => [c.id, c]));

/** A card's passive effects as a list (a card may carry none, one or several). */
export function passivesOf(def: CardDef): readonly PassiveEffect[] {
  const p = def.passive;
  if (!p) return [];
  return Array.isArray(p) ? p : [p as PassiveEffect];
}

export function cardDef(id: string): CardDef {
  const hash = id.indexOf("#");
  const defId = hash === -1 ? id : id.slice(0, hash);
  const def = CARD_DEFS.get(defId);
  if (!def) throw new Error(`Unknown card ${id}`);
  return def;
}

/** How many copies of a card carry the Rookie "A" marker. */
export function rookieCopiesOf(def: CardDef): number {
  return def.rookieCopies ?? (def.rookie ? def.copies : 0);
}

/** Whether this physical card (`${id}#${n}`) carries the Rookie "A" marker. */
export function isRookieCard(card: string): boolean {
  const hash = card.indexOf("#");
  const n = Number(card.slice(hash + 1));
  return Number.isInteger(n) && n < rookieCopiesOf(cardDef(card));
}

/** Split defs into their A copies and the rest, as physical cards. */
export function expandByRookie(defs: readonly CardDef[]): { a: string[]; rest: string[] } {
  const a: string[] = [];
  const rest: string[] = [];
  for (const def of defs) {
    const marked = rookieCopiesOf(def);
    for (let n = 0; n < def.copies; n++) (n < marked ? a : rest).push(`${def.id}#${n}`);
  }
  return { a, rest };
}

/** Expand defs into physical cards `${id}#${n}`. */
export function expand(defs: readonly { id: string; copies: number }[], prefix = ""): string[] {
  const out: string[] = [];
  for (const def of defs) {
    for (let n = 0; n < def.copies; n++) out.push(`${def.id}#${prefix}${n}`);
  }
  return out;
}

export const VAMPIRES: readonly { id: string; name: string; color: string }[] = [
  { id: "crimson", name: "Crimson", color: "#c0392b" },
  { id: "violet", name: "Violet", color: "#8e44ad" },
  { id: "emerald", name: "Emerald", color: "#27ae60" },
  { id: "sapphire", name: "Sapphire", color: "#2e86de" },
  { id: "amber", name: "Amber", color: "#e67e22" },
  { id: "silver", name: "Silver", color: "#95a5a6" },
];
