import type { Keyword } from "@boardgames/core/games/the-hunger/types";
import type { ArtName } from "./art";
import { KEYWORD_ICON } from "./art";

/**
 * Every keyword's name and what it does, in one place: the Hunt's glossary,
 * the big card preview and the compact card rows all read this, so an icon
 * is never left unexplained and the wording never drifts.
 */
export interface KeywordInfo {
  id: Keyword;
  name: string;
  /** One sentence: what the keyword does. */
  text: string;
  icon: ArtName;
  /** Stands in until the icon file exists. */
  glyph: string;
}

const RAW: readonly Omit<KeywordInfo, "icon">[] = [
  { id: "fast", glyph: "⚡", name: "Fast", text: "A pile holding it costs 1 more Speed to hunt." },
  { id: "slow", glyph: "🐢", name: "Slow", text: "Joins the track in column 2, not column 3." },
  {
    id: "spicy",
    glyph: "🌶",
    name: "Spicy",
    text: "Stays in play, and your move must head for the nearest Well, until you end a turn on one.",
  },
  {
    id: "confuse",
    glyph: "😵",
    name: "Confuse",
    text: "In play: before you move, you stagger 4 spaces toward the Labyrinth.",
  },
  {
    id: "holy-water",
    glyph: "💧",
    name: "Holy Water",
    text: "In play: you cannot hunt that turn.",
  },
  {
    id: "gregarious",
    glyph: "👥",
    name: "Gregarious",
    text: "When you hunt it, the top card of the Hunt deck comes too.",
  },
  {
    id: "inspiring",
    glyph: "📜",
    name: "Inspiring",
    text: "When you hunt it, take a Mission from a Crypt.",
  },
  {
    id: "ready",
    glyph: "↥",
    name: "Ready",
    text: "When you hunt it, put it on top of your deck or in your discard pile.",
  },
  {
    id: "permanent",
    glyph: "∞",
    name: "Permanent",
    text: "Stays in your playing area every turn instead of being discarded.",
  },
  {
    id: "unique",
    glyph: "★",
    name: "Unique",
    text: "There is only one. Each Vampire may hold a single Rose.",
  },
];

export const KEYWORDS: readonly KeywordInfo[] = RAW.map((k) => ({
  ...k,
  icon: KEYWORD_ICON[k.id],
}));

const BY_ID = new Map(KEYWORDS.map((k) => [k.id, k]));

export function keywordInfo(id: Keyword): KeywordInfo {
  const k = BY_ID.get(id);
  if (!k) throw new Error(`Unknown keyword ${id}`);
  return k;
}
