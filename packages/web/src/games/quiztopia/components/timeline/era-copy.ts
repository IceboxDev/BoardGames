import {
  type Era,
  formatDatePart,
  type TimelineKind,
} from "@boardgames/core/games/quiztopia/timeline";

// Captions around the timeline: an era's range ("3000 BC – AD 476") and
// the kind of an event in a reader's words.

export function eraRange(era: Era, lang: "en" | "de"): string {
  if (era.id === "deep-time") {
    return lang === "de" ? "vor 13,8 Mrd. J. – 3000 v. Chr." : "13.8 bn years ago – 3000 BC";
  }
  const from = formatDatePart({ year: era.from, month: null, day: null }, "year", lang);
  if (era.id === "c21") return lang === "de" ? `seit ${from}` : `since ${from}`;
  const to = formatDatePart({ year: era.to, month: null, day: null }, "year", lang);
  return `${from} – ${to}`;
}

const KIND: Record<TimelineKind, { en: string; de: string }> = {
  event: { en: "Event", de: "Ereignis" },
  lifespan: { en: "Lifespan", de: "Lebensdaten" },
  period: { en: "Period", de: "Zeitraum" },
  reign: { en: "Reign", de: "Herrschaft" },
  creation: { en: "Work", de: "Werk" },
  founding: { en: "Founding", de: "Gründung" },
  discovery: { en: "Discovery", de: "Entdeckung" },
  era: { en: "Era", de: "Epoche" },
};

export function kindLabel(kind: TimelineKind, lang: "en" | "de"): string {
  return KIND[kind][lang];
}
