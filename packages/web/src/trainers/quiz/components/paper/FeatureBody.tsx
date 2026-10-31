import type { QuizLang } from "@boardgames/core/protocol";
import { type ComponentProps, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../../../lib/cn";
import { domainOf } from "../../domains";
import { ArticleBody } from "../wiki/ArticleBody";
import { alignFloats, photoSpans } from "./feature-photo";
import { PaperPhoto } from "./Paper";

// An article set as a newspaper feature: the story in ONE justified column at
// a reading measure between hairline rules, its photos set the way a paper
// sets them — across the whole column, or at its left edge with the text
// running down the right, its foot on the baseline of a paragraph's last
// line (`feature-photo.ts`); on a phone every photo spans the column. The
// first photo leads the story, the rest are spread between its paragraphs
// (each may move down a paragraph or two to line up),
// and an end mark in the section's ink closes it. Used by the day's reading
// pages and the archive's article page alike.

type Image = ComponentProps<typeof PaperPhoto>["image"];

/** The feature's width: its head lines up with the column (rules included). */
export const FEATURE_WIDTH = "mx-auto w-full max-w-3xl 2xl:max-w-4xl 3xl:max-w-6xl";
/** The feature's headline: centred over the column, set large, lines balanced. */
export const FEATURE_HEADLINE = "text-center text-balance lg:text-6xl lg:leading-none";

/** Where photos sit beside the text; below it every photo spans the column. */
const SIDE_BY_SIDE = "(min-width: 64rem)";
/** Passes that may still move a photo, per text and width. */
const MAX_SEARCHES = 3;

type Props = Omit<ComponentProps<typeof ArticleBody>, "print" | "after" | "endMark" | "domain"> & {
  domain: string;
  images: readonly Image[];
  lang: QuizLang;
  /** The story column's element: `article` where nothing around it is one. */
  as?: "article" | "div";
};

export function FeatureBody({ images, lang, domain, as: Column = "div", ...body }: Props) {
  const d = domainOf(domain);
  // Where each photo stands: the first before the text, the rest spread
  // evenly between its blocks — unless lining one up moved it (`moves`).
  const [moves, setMoves] = useState<ReadonlyMap<string, number>>(new Map());
  const at = new Map<number, Image>();
  const n = body.blocks.length;
  images.forEach((img, i) => {
    const spread = i === 0 ? -1 : Math.max(0, Math.round((i * n) / images.length) - 1);
    const after = moves.get(img.url) ?? spread;
    if (!at.has(after)) at.set(after, img);
    else if (!at.has(spread)) at.set(spread, img);
  });
  const leadPhoto = at.get(-1);

  // Size the set-left photos to the text beside them, again whenever the
  // column's width, the fonts or a photo's file change what that text does.
  const ref = useRef<HTMLElement | null>(null);
  const searches = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new text or photo set starts afresh.
  useLayoutEffect(() => {
    searches.current = 0;
    setMoves(new Map());
  }, [body.blocks, images, lang]);
  useLayoutEffect(() => {
    const column = ref.current;
    if (!column) return;
    const wide = window.matchMedia(SIDE_BY_SIDE);
    const run = () => {
      if (!wide.matches) {
        for (const f of column.querySelectorAll<HTMLElement>("figure[data-float]")) {
          f.style.width = "";
          f.style.float = "";
          const img = f.querySelector("img");
          if (img) img.style.cssText = "";
        }
        return;
      }
      // A photo moved to line up is rendered there, then lined up again; a
      // few rounds at most, should moves ever keep leading to moves.
      const found = alignFloats(column, searches.current < MAX_SEARCHES);
      searches.current += 1;
      if (found) setMoves((m) => new Map([...m, ...found]));
    };
    run();
    let width = column.clientWidth;
    const observer = new ResizeObserver(() => {
      if (column.clientWidth === width) return;
      width = column.clientWidth;
      searches.current = 0;
      run();
    });
    observer.observe(column);
    column.addEventListener("load", run, true);
    wide.addEventListener("change", run);
    let live = true;
    void document.fonts?.ready.then(() => live && run());
    return () => {
      live = false;
      observer.disconnect();
      column.removeEventListener("load", run, true);
      wide.removeEventListener("change", run);
    };
  }, [moves]);

  return (
    <Column
      ref={(el: HTMLElement | null) => {
        ref.current = el;
      }}
      lang={lang}
      className={cn(
        FEATURE_WIDTH,
        "flow-root hyphens-auto text-justify font-news text-lg leading-relaxed text-fg-primary lg:border-x lg:border-line-soft lg:px-10 2xl:text-xl 3xl:text-2xl",
      )}
    >
      {leadPhoto && <FeaturePhoto image={leadPhoto} lang={lang} />}
      <ArticleBody
        {...body}
        print
        domain={domain}
        after={(bi) => {
          const img = at.get(bi);
          return img ? <FeaturePhoto image={img} lang={lang} /> : null;
        }}
        endMark={
          <span
            aria-hidden="true"
            title="End of the article"
            className="ml-1.5 text-sm"
            style={{ color: d.color }}
          >
            ■
          </span>
        }
      />
    </Column>
  );
}

/** One photo of the feature: across the column, or set at its left (`feature-photo.ts`). */
function FeaturePhoto({ image, lang }: { image: Image; lang: QuizLang }) {
  if (photoSpans(image.width, image.height)) {
    return <PaperPhoto image={image} lang={lang} className="mb-5 w-full" />;
  }
  return (
    <PaperPhoto
      image={image}
      lang={lang}
      // The width is set by `alignFloats`; a third of the column until it runs.
      className="mb-5 w-full lg:float-left lg:mr-6 lg:mb-3 lg:w-1/3"
      data={{
        "data-float": "",
        "data-key": image.url,
        "data-w": image.width,
        "data-h": image.height,
      }}
    />
  );
}
