import type { QuiztopiaLanguage } from "@boardgames/core/protocol";
import { Eyebrow } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { pickNotes } from "../../logic/copy";

// The editor's note on a set — a misprint on the card, a fact that has
// since changed, an accepted variant. Amber, because it qualifies the answer
// rather than being part of it. Each language carries its own note: a note
// about one language's wording shows only in that language, a neutral one
// in both (and once, when both languages are on screen). Internal
// transcription notes never reach the content files. Renders nothing when
// the set has no note for the language.

type Props = {
  language: QuiztopiaLanguage;
  notesEn: string | undefined;
  notesDe: string | undefined;
  size?: "sm" | "xs";
  className?: string;
};

export function EditorNote({ language, notesEn, notesDe, size = "sm", className }: Props) {
  const notes = pickNotes(language, notesEn, notesDe);
  if (notes.length === 0) return null;
  return (
    <div
      className={cn(
        "rounded-card-md border border-amber-500/20 bg-amber-500/5",
        size === "sm" ? "px-3 py-2" : "px-2.5 py-1.5",
        className,
      )}
    >
      <Eyebrow tone="amber" size="sm">
        {language === "de" ? "Anmerkung der Redaktion" : "Editor's note"}
      </Eyebrow>
      {notes.map((n) => (
        <p
          key={n.lang}
          lang={n.lang}
          className={cn(
            "mt-0.5 leading-relaxed text-fg-secondary",
            size === "sm" ? "text-xs" : "text-2xs",
          )}
        >
          {n.text}
        </p>
      ))}
    </div>
  );
}
