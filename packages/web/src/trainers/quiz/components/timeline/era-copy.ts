import type { TimelineKind } from "@boardgames/core/quiz/timeline";
import { type Block, blockLabel, blockTitle } from "@boardgames/core/quiz/timeline-blocks";

// Captions around the timeline: a block header's words ("20th century ›
// 1990s", "Unity, Techno & the Web") and the kind of an event in a
// reader's words.

/** A header chain's date ranges, joined: "2nd millennium AD › 20th century". */
export function chainLabel(chain: readonly Block[], lang: "en" | "de" | "ru"): string {
  return chain.map((b) => blockLabel(b, lang)).join(" › ");
}

/** The name the header shows: the deepest named block of the chain. */
export function chainTitle(chain: readonly Block[], lang: "en" | "de" | "ru"): string | null {
  for (let i = chain.length - 1; i >= 0; i--) {
    const t = blockTitle(chain[i], lang);
    if (t) return t;
  }
  return null;
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

const KIND_RU: Record<TimelineKind, string> = {
  event: "Событие",
  lifespan: "Годы жизни",
  period: "Период",
  reign: "Правление",
  creation: "Произведение",
  founding: "Основание",
  discovery: "Открытие",
  era: "Эпоха",
};

export function kindLabel(kind: TimelineKind, lang: "en" | "de" | "ru"): string {
  return lang === "ru" ? KIND_RU[kind] : KIND[kind][lang];
}
