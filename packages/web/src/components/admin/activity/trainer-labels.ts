import { type SettingsChanges, TRAINER_DECKS, type TrainerDeck } from "@boardgames/core/protocol";
import { count } from "./describe-context";

/** How a trainer is named in a sentence. */
export const TRAINER_NAME: Readonly<Record<TrainerDeck, string>> = {
  quiztopia: "Quiztopia",
  geography: "World Geography",
};

/** The trainer a page view's `detail` names, as words. */
export function trainerName(detail: string | undefined): string {
  const deck = TRAINER_DECKS.find((d) => d === detail);
  return deck ? TRAINER_NAME[deck] : "a quiz";
}

type ValueWords = Readonly<Record<string, string>>;

interface FieldLabel {
  /** The setting, as a member would call it. */
  name: string;
  /** Words for enum values; anything else is spelled out generically. */
  values?: ValueWords;
}

const LANGUAGE: ValueWords = { en: "English", de: "German", both: "English + German" };
const CONTINENT: ValueWords = {
  af: "Africa",
  an: "Antarctica",
  as: "Asia",
  eu: "Europe",
  na: "North America",
  oc: "Oceania",
  sa: "South America",
};

// Keyed by the settings schemas' field names (core/protocol/http/quiztopia.ts
// and trainer-geography.ts). An unknown field still reads — by its key.
const FIELDS: Readonly<Record<TrainerDeck, Readonly<Record<string, FieldLabel>>>> = {
  quiztopia: {
    language: { name: "language", values: LANGUAGE },
    newPerDay: { name: "new questions a day" },
    newPerDayByCategory: { name: "per-district new questions" },
    includeLeeches: { name: "leeches" },
    gameReviewsAffectSrs: { name: "table-game answers count" },
    newCardOrder: {
      name: "new-card order",
      values: { sets: "whole sets", originals: "originals first" },
    },
    newSetsPerDay: { name: "new sets a day" },
  },
  geography: {
    language: { name: "language", values: LANGUAGE },
    newPerDay: { name: "new places a day" },
    directions: {
      name: "directions",
      values: { both: "both ways", locate: "find on the map", name: "name the place" },
    },
    focus: { name: "continent focus", values: CONTINENT },
    includeLeeches: { name: "leeches" },
  },
};

function valueWords(value: unknown, words: ValueWords | undefined): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "string") return words?.[value] ?? value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") return Object.keys(value).length === 0 ? "none" : "custom";
  return String(value);
}

const CHANGE_CAP = 3;

/**
 * "new questions a day 10 → 15, language English → German" — at most three,
 * then "+N more".
 */
export function describeSettingsChanges(deck: TrainerDeck, changes: SettingsChanges): string {
  const fields = FIELDS[deck];
  const parts = Object.entries(changes).map(([key, { from, to }]) => {
    const label = fields[key];
    const name = label?.name ?? key;
    return `${name} ${valueWords(from, label?.values)} → ${valueWords(to, label?.values)}`;
  });
  const more = parts.length - CHANGE_CAP;
  return (
    parts.slice(0, CHANGE_CAP).join(", ") + (more > 0 ? `, +${count(more, "more change")}` : "")
  );
}
