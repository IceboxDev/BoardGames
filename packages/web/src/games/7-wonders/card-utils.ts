import { getCardDef } from "@boardgames/core/games/7-wonders/cards";
import type { ScoreBreakdown } from "@boardgames/core/games/7-wonders/scoring";
import type {
  CardColor,
  CardDef,
  CardId,
  Cost,
  Payment,
  ResourceType,
  ScienceSymbol,
  WonderStageEffect,
} from "@boardgames/core/games/7-wonders/types";
import { cardIdName } from "@boardgames/core/games/7-wonders/types";

export function defOf(cardId: CardId): CardDef {
  return getCardDef(cardIdName(cardId));
}

export const COLOR_HEX: Record<CardColor, string> = {
  brown: "#92603a",
  grey: "#8e9aa5",
  blue: "#3b82f6",
  yellow: "#d9a520",
  red: "#dc4b4b",
  green: "#3fa860",
  purple: "#9d5bc0",
};

export const COLOR_LABEL: Record<CardColor, string> = {
  brown: "Raw material",
  grey: "Manufactured good",
  blue: "Civilian",
  yellow: "Commercial",
  red: "Military",
  green: "Science",
  purple: "Guild",
};

export const RESOURCE_GLYPH: Record<ResourceType, string> = {
  wood: "🪵",
  stone: "🪨",
  clay: "🧱",
  ore: "⛏️",
  glass: "🫙",
  loom: "🧵",
  papyrus: "📜",
};

export const SCIENCE_GLYPH: Record<ScienceSymbol, string> = {
  gear: "⚙️",
  compass: "🧭",
  tablet: "📖",
};

export function costText(cost: Cost): string {
  const parts: string[] = [];
  if (cost.coins) parts.push(`${cost.coins}🪙`);
  for (const [resource, amount] of Object.entries(cost.resources ?? {})) {
    parts.push(RESOURCE_GLYPH[resource as ResourceType].repeat(amount));
  }
  return parts.join(" ");
}

function scopeText(scopes: readonly ("self" | "left" | "right")[]): string {
  if (scopes.length === 3) return "you & neighbors";
  if (scopes.length === 1 && scopes[0] === "self") return "you";
  return "neighbors";
}

/** Short human label for a card or wonder-stage effect. */
export function effectLabel(effect: WonderStageEffect): string {
  switch (effect.kind) {
    case "production": {
      if (effect.resources.length === 1) {
        return RESOURCE_GLYPH[effect.resources[0]].repeat(effect.count ?? 1);
      }
      return effect.resources.map((r) => RESOURCE_GLYPH[r]).join("/");
    }
    case "points":
      return `${effect.amount} VP`;
    case "shields":
      return `${effect.amount}🛡️`;
    case "science":
      return SCIENCE_GLYPH[effect.symbol];
    case "coins":
      return `${effect.amount}🪙`;
    case "coins-per-card":
      return `${effect.amount}🪙 / ${effect.color} (${scopeText(effect.scopes)})`;
    case "coins-per-stage":
      return `${effect.amount}🪙 / wonder stage (${scopeText(effect.scopes)})`;
    case "points-per-card":
      return `${effect.amount} VP / ${effect.color} (${scopeText(effect.scopes)})`;
    case "points-per-stage":
      return `${effect.amount} VP / wonder stage (${scopeText(effect.scopes)})`;
    case "points-if-wonder-complete":
      return `${effect.amount} VP if wonder complete`;
    case "trade-discount": {
      const sides = effect.neighbors.length === 2 ? "both neighbors" : `${effect.neighbors[0]}`;
      return `Buy ${effect.resources} for 1🪙 (${sides})`;
    }
    case "science-wildcard":
      return "⚙️/🧭/📖 wildcard";
    case "play-discarded":
      return "Build a discarded card free";
    case "free-first-of-color":
      return "First card of each colour free";
    case "free-first-of-age":
      return "First card of each age free";
    case "free-last-of-age":
      return "Last card of each age free";
    case "play-seventh-card":
      return "Play your 7th card each age";
  }
}

export function paymentLabel(payment: Payment): string {
  if (payment.kind === "chain") return "Free — chain";
  if (payment.kind === "free-build") return "Free — Olympia";
  const { left, right } = payment;
  if (left === 0 && right === 0) return "Free";
  const parts: string[] = [];
  if (left > 0) parts.push(`${left}🪙 → left`);
  if (right > 0) parts.push(`${right}🪙 → right`);
  return parts.join(" · ");
}

export function paymentCost(payment: Payment): number {
  return payment.kind === "resources" ? payment.left + payment.right : 0;
}

export const AGE_LABEL: Record<1 | 2 | 3, string> = { 1: "Age Ⅰ", 2: "Age Ⅱ", 3: "Age Ⅲ" };

const SCOPE_WORDS = (scopes: readonly ("self" | "left" | "right")[]): string => {
  const self = scopes.includes("self");
  const left = scopes.includes("left");
  const right = scopes.includes("right");
  if (self && left && right) return "you and both neighbours have";
  if (left && right) return "your two neighbours have";
  if (self) return "you have";
  return left ? "your left neighbour has" : "your right neighbour has";
};

const COLOR_WORD: Record<CardColor, string> = {
  brown: "brown",
  grey: "grey",
  blue: "blue",
  yellow: "yellow",
  red: "red",
  green: "green",
  purple: "purple",
};

/** A card or wonder-stage effect spelled out as a sentence (previews, tooltips). */
export function effectSentence(effect: WonderStageEffect): string {
  switch (effect.kind) {
    case "production": {
      if (effect.resources.length === 1) {
        const n = effect.count ?? 1;
        return `Produces ${n} ${effect.resources[0]}${n > 1 ? " each turn" : ""}`;
      }
      return `Produces one of ${effect.resources.join(" / ")} each turn`;
    }
    case "points":
      return `Worth ${effect.amount} VP`;
    case "shields":
      return `${effect.amount} shield${effect.amount === 1 ? "" : "s"} for every conflict`;
    case "science":
      return `Science: ${effect.symbol}`;
    case "coins":
      return `Take ${effect.amount} coins now`;
    case "coins-per-card":
      return `Take ${effect.amount} coin${effect.amount === 1 ? "" : "s"} now for each ${COLOR_WORD[effect.color]} card ${SCOPE_WORDS(effect.scopes)}`;
    case "coins-per-stage":
      return `Take ${effect.amount} coin${effect.amount === 1 ? "" : "s"} now for each wonder stage ${SCOPE_WORDS(effect.scopes)} built`;
    case "points-per-card":
      return `${effect.amount} VP at the end for each ${COLOR_WORD[effect.color]} card ${SCOPE_WORDS(effect.scopes)}`;
    case "points-per-stage":
      return `${effect.amount} VP at the end for each wonder stage ${SCOPE_WORDS(effect.scopes)} built`;
    case "points-if-wonder-complete":
      return `${effect.amount} VP at the end if every stage of your wonder is built`;
    case "trade-discount": {
      const goods = effect.resources === "raw" ? "raw materials" : "manufactured goods";
      const from =
        effect.neighbors.length === 2
          ? "either neighbour"
          : `your ${effect.neighbors[0]} neighbour`;
      return `Buy ${goods} from ${from} for 1 coin`;
    }
    case "science-wildcard":
      return "Counts as the science symbol of your choice";
    case "play-discarded":
      return "Build a card from the discard pile for free";
    case "free-first-of-color":
      return "Build the first card of each colour for free";
    case "free-first-of-age":
      return "Build the first card of each age for free";
    case "free-last-of-age":
      return "Build the last card of each age for free";
    case "play-seventh-card":
      return "Play your seventh card at the end of each age";
  }
}

export type ScoreCategory = Exclude<keyof ScoreBreakdown, "total">;

/** The score categories in the printed score pad's order, with their colours. */
export const SCORE_CATEGORIES: readonly { key: ScoreCategory; label: string; hex: string }[] = [
  { key: "military", label: "Military", hex: "#dc4b4b" },
  { key: "coins", label: "Treasury", hex: "#d9a520" },
  { key: "wonder", label: "Wonder", hex: "#c99a52" },
  { key: "civilian", label: "Civilian", hex: "#3b82f6" },
  { key: "commercial", label: "Commercial", hex: "#e8b730" },
  { key: "guilds", label: "Guilds", hex: "#9d5bc0" },
  { key: "science", label: "Science", hex: "#3fa860" },
  { key: "edifice", label: "Edifice", hex: "#2bb3a3" },
];

/** Card colours in the order the city lays them out. */
export const TABLEAU_ORDER: readonly CardColor[] = [
  "brown",
  "grey",
  "yellow",
  "red",
  "blue",
  "green",
  "purple",
];

export const AGE_NUMERAL: Record<1 | 2 | 3, string> = { 1: "Ⅰ", 2: "Ⅱ", 3: "Ⅲ" };
export const STAGE_NUMERAL = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ"] as const;
