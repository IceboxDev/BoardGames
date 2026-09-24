// The six "Hilfe in der Not" cards. Only Besetzung and Datenleak are pinned
// down by the rulebook; the other four effects are designed from their
// names and flagged `assumed` so the UI can say so and the texts can be
// swapped for the printed ones without touching the engine.

import type { HelpCardDef, HelpCardId } from "./types.ts";

export const HELP_CARDS: readonly HelpCardDef[] = [
  {
    id: "besetzung",
    nameDe: "Besetzung",
    nameEn: "Occupation",
    textDe:
      "Besetzt ein verlorenes Gebäude zurück: Legt eine Gebäudekarte von den verlorenen Gebäuden mit der dunklen Seite nach oben zurück in die Mitte. Auch nach der Niederlage einsetzbar, um weiterzuspielen.",
    textEn:
      "Occupy a lost building: return one building from the lost pile to the middle, dark side up. Can also be played right after the losing answer to keep the game alive.",
    effect: "return-lost-building",
    soloAllowed: true,
    assumed: false,
  },
  {
    id: "datenleak",
    nameDe: "Datenleak",
    nameEn: "Data leak",
    textDe:
      "Eine Person, die weder an der Reihe ist noch vorliest, darf sich heimlich die Antwort ansehen. In einem Plenum zu dieser Frage darf sie nicht mitdiskutieren.",
    textEn:
      "One player who is neither answering nor reading may secretly look at the answer. They sit out any Plenum on this question.",
    effect: "peek-answer",
    soloAllowed: false,
    assumed: false,
  },
  {
    id: "insidertipp",
    nameDe: "Insidertipp",
    nameEn: "Insider tip",
    textDe: "Die vorlesende Person darf euch genau ein Wort als Tipp geben.",
    textEn: "The reader may give the table exactly one word as a tip.",
    effect: "reader-tip",
    soloAllowed: false,
    assumed: true,
  },
  {
    id: "benefizvorstellung",
    nameDe: "Benefizvorstellung",
    nameEn: "Benefit performance",
    textDe: "Die vorlesende Person darf die Antwort pantomimisch darstellen – ganz ohne Worte.",
    textEn: "The reader may act out the answer in pantomime, without a single word.",
    effect: "reader-mime",
    soloAllowed: false,
    assumed: true,
  },
  {
    id: "alternative-fakten",
    nameDe: "Alternative Fakten",
    nameEn: "Alternative facts",
    textDe:
      "Diese Frage gefällt euch nicht? Legt sie ab und zieht für dasselbe Gebäude die nächste Fragekarte.",
    textEn: "Don't like this question? Discard it and draw the next card for the same building.",
    effect: "redraw-question",
    soloAllowed: true,
    assumed: true,
  },
  {
    id: "streik",
    nameDe: "Streik",
    nameEn: "Strike",
    textDe: "Die dunkle Seite streikt: Eine falsche Antwort hat in dieser Runde keine Folgen.",
    textEn: "The dark side is on strike: a wrong answer has no consequences this turn.",
    effect: "shield",
    soloAllowed: true,
    assumed: true,
  },
];

export function helpCardDef(id: HelpCardId): HelpCardDef {
  const def = HELP_CARDS.find((c) => c.id === id);
  if (!def) throw new Error(`unknown help card: ${id}`);
  return def;
}

/** The help deck for a table: all six, or the three solo-legal ones. */
export function helpDeckFor(playerCount: number): HelpCardId[] {
  return HELP_CARDS.filter((c) => playerCount > 1 || c.soloAllowed).map((c) => c.id);
}
