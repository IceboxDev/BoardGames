// Picking the bank's text in one language. Russian is still being written
// for much of the bank, so a missing Russian text falls back to English —
// the screen never goes blank.

export type TextLang = "en" | "de" | "ru";

/** The text in `lang` (Russian falls back to English when absent). */
export function inLang(
  lang: TextLang,
  text: { en: string; de: string; ru?: string | undefined },
): string {
  if (lang === "de") return text.de;
  if (lang === "ru") return text.ru ?? text.en;
  return text.en;
}

/** The texts for a primary and optional secondary language, primary first, duplicates dropped. */
export function inLangs(
  langs: { primary: TextLang; secondary: TextLang | null },
  text: { en: string; de: string; ru?: string | undefined },
): string[] {
  const first = inLang(langs.primary, text);
  if (!langs.secondary) return [first];
  const second = inLang(langs.secondary, text);
  return second === first ? [first] : [first, second];
}

/** An article-like object's field in `lang`: `field(a, "title", "ru")` reads `a.titleRu`. */
export function fieldIn<B extends string>(
  obj: { [K in `${B}En` | `${B}De`]: string } & { [K in `${B}Ru`]?: string | undefined },
  base: B,
  lang: TextLang,
): string {
  const o = obj as Record<string, string | undefined>;
  const en = o[`${base}En`] ?? "";
  if (lang === "de") return o[`${base}De`] ?? en;
  if (lang === "ru") return o[`${base}Ru`] ?? en;
  return en;
}
