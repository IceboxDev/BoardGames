import { useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { Chip } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import type { LaidOutEra } from "../../logic/timeline-layout";
import { eraDomId } from "./dom-ids";

// Jump between eras: a sticky vertical list beside the river on wide
// screens, a scrollable chip strip on phones. The era under the middle of
// the viewport is highlighted as the river scrolls past.

type Props = {
  eras: readonly LaidOutEra[];
  lang: "en" | "de";
  orientation: "vertical" | "horizontal";
  className?: string;
};

function useActiveEra(eras: readonly LaidOutEra[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = eras.map((e) => `${e.era.id}:${e.y}`).join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the band geometry.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = eras
      .map((e) => document.getElementById(eraDomId(e.era.id)))
      .filter((el): el is HTMLElement => el !== null);
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) setActive(en.target.id.replace(/^tl-era-/, ""));
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const el of els) io.observe(el);
    return () => io.disconnect();
  }, [key]);
  return active;
}

export function EraRail({ eras, lang, orientation, className }: Props) {
  const reduced = useReducedMotion();
  const active = useActiveEra(eras);
  const jump = (id: string) =>
    document
      .getElementById(eraDomId(id))
      ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });

  if (orientation === "horizontal") {
    return (
      <nav
        aria-label={lang === "de" ? "Epochen" : "Eras"}
        className={cn("scrollbar-hide flex gap-1.5 overflow-x-auto", className)}
      >
        {eras.map((e) => (
          <Chip
            key={e.era.id}
            pressed={active === e.era.id}
            size="xs"
            shape="pill"
            onClick={() => jump(e.era.id)}
            className="shrink-0"
          >
            {lang === "de" ? e.era.shortDe : e.era.shortEn}
            <span className="tabular-nums text-fg-muted"> {e.count}</span>
          </Chip>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label={lang === "de" ? "Epochen" : "Eras"} className={cn("flex flex-col", className)}>
      <ol className="flex flex-col border-l border-line">
        {eras.map((e) => {
          const on = active === e.era.id;
          return (
            <li key={e.era.id}>
              {/* biome-ignore lint/correctness/noRestrictedElements: a table-of-contents row on the rail's own left border */}
              <button
                type="button"
                onClick={() => jump(e.era.id)}
                aria-current={on ? "location" : undefined}
                className={cn(
                  "-ml-px flex w-full items-baseline justify-between gap-2 border-l-2 py-1.5 pl-3 pr-1 text-left text-xs transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60",
                  on
                    ? "border-accent-400 font-semibold text-fg-strong"
                    : "border-transparent text-fg-muted hover:text-fg-secondary",
                  e.count === 0 && !on && "text-fg-disabled",
                )}
              >
                <span className="truncate">{lang === "de" ? e.era.shortDe : e.era.shortEn}</span>
                <span className="text-2xs tabular-nums">{e.count}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
