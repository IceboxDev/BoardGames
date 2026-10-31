import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "../../../../components/icons";
import { cn } from "../../../../lib/cn";
import type { LaidOutBlock, TimelineLayout } from "../../logic/timeline-layout";
import { PrintButton } from "../paper/Paper";
import { KICKER, RULE_DOUBLE_TOP } from "../paper/paper-style";
import { blockDomId } from "./dom-ids";
import { chainLabel, chainTitle } from "./era-copy";

// Where am I in time, and jump elsewhere. Wide screens: a sticky outline
// of the top blocks, opened down the path to the block in view. Phones: a
// sticky breadcrumb of that path ("2nd millennium AD › 20th century ›
// 1990s"). The block in view is the deepest one crossing the middle of the
// viewport as the river scrolls past.

type Props = {
  blocks: TimelineLayout["blocks"];
  lang: "en" | "de" | "ru";
  orientation: "vertical" | "horizontal";
  className?: string;
};

function useActiveBlock(blocks: readonly LaidOutBlock[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const inView = useRef(new Map<string, number>());
  const key = blocks.map((b) => `${b.id}:${b.y}:${b.bottom}`).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the band geometry.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const byDom = new Map(blocks.map((b) => [blockDomId(b.id), b]));
    const seen = inView.current;
    seen.clear();
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const b = byDom.get(en.target.id);
          if (!b) continue;
          if (en.isIntersecting) seen.set(b.id, b.depth);
          else seen.delete(b.id);
        }
        let best: string | null = null;
        let depth = -1;
        for (const [id, d] of seen) {
          if (d > depth) {
            best = id;
            depth = d;
          }
        }
        if (best) setActive(best);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const id of byDom.keys()) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [key]);
  return active;
}

export function BlockRail({ blocks: all, lang, orientation, className }: Props) {
  const reduced = useReducedMotion();
  const blocks = all.filter((b): b is LaidOutBlock => b.kind === "block");
  const active = useActiveBlock(blocks);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const path: LaidOutBlock[] = [];
  for (
    let b = active ? byId.get(active) : undefined;
    b;
    b = b.parent ? byId.get(b.parent) : undefined
  )
    path.unshift(b);
  const onPath = new Set(path.map((b) => b.id));
  const jump = (id: string) =>
    document
      .getElementById(blockDomId(id))
      ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  const nav = lang === "de" ? "Zeitabschnitte" : "Time blocks";

  if (orientation === "horizontal") {
    const crumbs = path.length > 0 ? path : blocks.filter((b) => b.depth === 0);
    return (
      <nav
        aria-label={nav}
        className={cn("scrollbar-hide flex items-center gap-3 overflow-x-auto", className)}
      >
        {crumbs.map((b, i) => {
          const last = path.length > 0 && i === crumbs.length - 1;
          const title = last ? chainTitle(b.chain, lang) : null;
          return (
            <span key={b.id} className="flex shrink-0 items-center gap-1">
              {path.length > 0 && i > 0 && (
                <ChevronRightIcon aria-hidden="true" className="h-3 w-3 text-fg-disabled" />
              )}
              <PrintButton
                onClick={() => jump(b.id)}
                aria-current={last ? "location" : undefined}
                className={cn("shrink-0", last ? "text-fg-strong" : "text-fg-muted")}
              >
                {chainLabel(b.chain, lang)}
                {title && <span className="text-fg-muted"> · {title}</span>}
                {path.length === 0 && (
                  <span className="tabular-nums text-fg-muted"> {b.count}</span>
                )}
              </PrintButton>
            </span>
          );
        })}
      </nav>
    );
  }

  // The outline: the top blocks, and the children of every block on the
  // path to the one in view.
  const rows: LaidOutBlock[] = [];
  const add = (parent: string | null) => {
    for (const b of blocks) {
      if (b.parent !== parent) continue;
      rows.push(b);
      if (onPath.has(b.id) && b.mode === "split") add(b.id);
    }
  };
  add(null);

  return (
    <nav aria-label={nav} className={cn("flex flex-col", className)}>
      <p
        className={cn(KICKER, RULE_DOUBLE_TOP, "border-b border-b-fg-primary py-1 text-fg-primary")}
      >
        {lang === "de" ? "Epochen" : "Eras"}
      </p>
      <ol className="flex flex-col">
        {rows.map((b) => {
          const on = active === b.id;
          const title = chainTitle(b.chain, lang);
          return (
            <li key={b.id}>
              {/* biome-ignore lint/correctness/noRestrictedElements: a table-of-contents row on the rail's own left border */}
              <button
                type="button"
                onClick={() => jump(b.id)}
                aria-current={on ? "location" : undefined}
                title={title ?? undefined}
                className={cn(
                  "flex w-full items-baseline justify-between gap-2 border-b border-dotted border-line-strong py-1 pr-1 text-left font-news transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60",
                  b.depth === 0 ? "text-sm" : "text-xs",
                  on
                    ? "font-semibold text-accent-300"
                    : onPath.has(b.id)
                      ? "text-fg-primary"
                      : "text-fg-muted hover:text-fg-strong",
                )}
                style={{ paddingLeft: b.depth * 10 }}
              >
                <span className="truncate">
                  {chainLabel(
                    b.chain.slice(b.depth === 0 ? 0 : -1, b.depth === 0 ? 1 : undefined),
                    lang,
                  )}
                </span>
                <span className="text-xs tabular-nums">{b.count}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
