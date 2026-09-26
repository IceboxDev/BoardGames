import type { CardDef } from "@boardgames/core/games/the-hunger/types";

/**
 * One colour per kind of card: green Powers (Starting ones too), violet
 * Familiars, and the four Human types — white Villagers, red Military,
 * yellow Religious, blue Nobles. Roses keep their rose.
 */
export type CardTone =
  | "power"
  | "familiar"
  | "villager"
  | "military"
  | "religious"
  | "noble"
  | "rose";

export function toneOf(def: CardDef): CardTone {
  if (def.type === "power" || def.type === "starting") return "power";
  if (def.type === "familiar") return "familiar";
  if (def.type === "item") return "rose";
  return def.category ?? "villager";
}

/** Compact rows (Hunt Track, your cards): a coloured edge and a light tint. */
export const ROW_TONE: Record<CardTone, string> = {
  power: "border-l-emerald-400 bg-emerald-500/10",
  familiar: "border-l-violet-400 bg-violet-500/10",
  villager: "border-l-stone-100 bg-stone-100/10",
  military: "border-l-red-500 bg-red-500/10",
  religious: "border-l-yellow-400 bg-yellow-400/10",
  noble: "border-l-blue-500 bg-blue-500/10",
  rose: "border-l-rose-400 bg-rose-500/10",
};

/** Full card faces (dialogs): the whole face in the kind's colour. */
export const FACE_TONE: Record<CardTone, string> = {
  power: "bg-gradient-to-b from-emerald-700 to-emerald-950 text-emerald-50",
  familiar: "bg-gradient-to-b from-violet-700 to-violet-950 text-violet-50",
  villager: "bg-gradient-to-b from-stone-50 to-stone-300 text-stone-900",
  military: "bg-gradient-to-b from-red-700 to-red-950 text-red-50",
  religious: "bg-gradient-to-b from-yellow-200 to-yellow-400 text-yellow-950",
  noble: "bg-gradient-to-b from-blue-700 to-blue-950 text-blue-50",
  rose: "bg-gradient-to-b from-rose-700 to-rose-950 text-rose-50",
};

/** The same colours as hex, for the History log's card tags. */
export const TONE_HEX: Record<CardTone, string> = {
  power: "#34d399",
  familiar: "#a78bfa",
  villager: "#e7e5e4",
  military: "#ef4444",
  religious: "#facc15",
  noble: "#60a5fa",
  rose: "#fb7185",
};
