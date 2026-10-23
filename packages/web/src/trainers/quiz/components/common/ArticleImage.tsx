import type { QuizLang } from "@boardgames/core/protocol";
import type { ArticleImage as ArticleImageData } from "@boardgames/core/quiz/content-types";
import { useState } from "react";
import { Surface } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";

// An article's picture (a portrait, the work, a diagram, a map), hotlinked
// from where it was found. `figure` = the article page's lead image with
// its caption and credit; `thumb` = a small framed picture beside a study
// card's snippet. A picture that fails to load disappears instead of
// leaving a broken frame; it is never stretched.

type Props = {
  image: ArticleImageData;
  lang: QuizLang;
  variant?: "figure" | "thumb";
  className?: string;
};

export function ArticleImage({ image, lang, variant = "figure", className }: Props) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  const img = (
    <img
      src={image.url}
      alt={image.alt[lang]}
      loading="lazy"
      referrerPolicy="no-referrer"
      width={image.width}
      height={image.height}
      onError={() => setBroken(true)}
      className={cn(
        "block h-auto w-auto max-w-full object-contain",
        variant === "figure" ? "max-h-80" : "max-h-24",
      )}
    />
  );
  if (variant === "thumb") {
    return (
      <Surface
        as="span"
        variant="tile"
        padding="none"
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden",
          className,
        )}
        title={image.caption[lang]}
      >
        {img}
      </Surface>
    );
  }
  return (
    <figure className={cn("flex flex-col items-center gap-1.5", className)}>
      <Surface
        as="span"
        variant="tile"
        padding="none"
        radius="lg"
        className="inline-flex max-w-full items-center justify-center overflow-hidden"
      >
        {img}
      </Surface>
      <figcaption
        className="max-w-prose text-center text-2xs leading-snug text-fg-muted"
        lang={lang}
      >
        {image.caption[lang]}
        {image.credit && <span className="text-fg-disabled"> · {image.credit}</span>}
      </figcaption>
    </figure>
  );
}
