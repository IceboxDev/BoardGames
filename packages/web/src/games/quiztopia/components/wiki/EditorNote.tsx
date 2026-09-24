import type { ReactNode } from "react";
import { Eyebrow } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";

// The transcription pass's note on a set — a misprint on the card, a fact
// that has since changed. Amber, because it qualifies the answer rather
// than being part of it. Shown on the study card's back and the article.

type Props = {
  children: ReactNode;
  className?: string;
};

export function EditorNote({ children, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-card-md border border-amber-500/20 bg-amber-500/5 px-3 py-2",
        className,
      )}
    >
      <Eyebrow tone="amber" size="sm">
        Editor's note
      </Eyebrow>
      <p className="mt-0.5 text-xs leading-relaxed text-fg-secondary">{children}</p>
    </div>
  );
}
