import { getCardDef } from "@boardgames/core/games/7-wonders/cards";
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
    case "points-per-defeat":
      return `${effect.amount} VP / defeat (${scopeText(effect.scopes)})`;
    case "trade-discount": {
      const sides = effect.neighbors.length === 2 ? "both neighbors" : `${effect.neighbors[0]}`;
      return `Buy ${effect.resources} for 1🪙 (${sides})`;
    }
    case "science-wildcard":
      return "⚙️/🧭/📖 wildcard";
    case "play-discarded":
      return "Build a discarded card free";
    case "free-build-per-age":
      return "Free build once per age";
    case "play-seventh-card":
      return "Play your 7th card each age";
    case "copy-guild":
      return "Copy a neighbor's guild";
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
