// ---------------------------------------------------------------------------
// The 26 Bonus tokens, from the real set: each is 2 VP when collected, with
// its effect on the other side. (The box also holds two blank tokens that
// are not part of the game.)
// ---------------------------------------------------------------------------

import type { BonusDef } from "../types";

export const BONUS_TOKENS: readonly BonusDef[] = [
  {
    id: "mission",
    name: "Gain 1 Mission",
    bonus: { kind: "mission" },
    copies: 2,
    text: "Take a Mission from any stack, as if you were on it.",
  },
  {
    id: "parasol",
    name: "Parasol",
    bonus: { kind: "parasol" },
    copies: 3,
    text: "One more turn after the last, without hunting.",
  },
  {
    id: "villager",
    name: "Villager",
    bonus: { kind: "human", category: "villager" },
    copies: 1,
    text: "Counts as 1 Villager.",
  },
  {
    id: "religious",
    name: "Religious",
    bonus: { kind: "human", category: "religious" },
    copies: 1,
    text: "Counts as 1 Religious.",
  },
  {
    id: "military",
    name: "Military",
    bonus: { kind: "human", category: "military" },
    copies: 1,
    text: "Counts as 1 Military.",
  },
  {
    id: "noble",
    name: "Noble",
    bonus: { kind: "human", category: "noble" },
    copies: 1,
    text: "Counts as 1 Noble.",
  },
  {
    id: "human-choice",
    name: "Human of your choice",
    bonus: { kind: "human-choice" },
    copies: 1,
    text: "Counts as 1 Human of a type chosen at the end of the game.",
  },
  {
    id: "velvet",
    name: "Velvet Clothing",
    bonus: { kind: "velvet" },
    copies: 6,
    text: "+2 more VP when collected (4 in total).",
  },
  {
    id: "extra-hunt",
    name: "+1 Hunt",
    bonus: { kind: "extra-hunt" },
    copies: 2,
    text: "One more Hunt this turn.",
  },
  {
    id: "discard-draw",
    name: "Discard / Draw",
    bonus: { kind: "discard-draw" },
    copies: 2,
    text: "Discard 1 card, then draw 1 card.",
  },
  {
    id: "draw",
    name: "Draw",
    bonus: { kind: "draw-to-play" },
    copies: 2,
    text: "Draw 1 card into your playing area.",
  },
  {
    id: "speed-1",
    name: "+1 Speed",
    bonus: { kind: "speed", n: 1 },
    copies: 2,
    text: "+1 Speed this turn.",
  },
  {
    id: "speed-2",
    name: "+2 Speed",
    bonus: { kind: "speed", n: 2 },
    copies: 2,
    text: "+2 Speed this turn.",
  },
];

export const BONUS_DEFS: ReadonlyMap<string, BonusDef> = new Map(
  BONUS_TOKENS.map((b) => [b.id, b]),
);

/** Physical token `${defId}#${n}` → its definition. */
export function bonusDef(id: string): BonusDef {
  const hash = id.indexOf("#");
  const def = BONUS_DEFS.get(hash === -1 ? id : id.slice(0, hash));
  if (!def) throw new Error(`Unknown bonus token ${id}`);
  return def;
}
