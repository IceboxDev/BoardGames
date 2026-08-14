import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

// ── Stack ────────────────────────────────────────────────────────────────
//
// The vertical-rhythm primitive. Pages were spacing their top-level sections
// three different ways — a `flex flex-col gap-6` wrapper here, a sibling `mt-6`
// there, per-child `mb-2/4/6` elsewhere — so the same product had three
// rhythms. `Stack` makes "a column of sections with a consistent gap" a single
// named choice instead of a per-page decision.
//
// Gap scale (maps to Tailwind `gap-*`):
//   2xs gap-1.5 the densest in-card rhythm (label + value + caption rows).
//               On the scale because it is the app's single most common
//               vertical gap — without it callers fell back to raw
//               `flex flex-col gap-1.5` and Stack lost by default.
//   xs  gap-2   tight clusters (chips, inline controls)
//   sm  gap-3   form fields / list rows
//   md  gap-4   default — cards within a section
//   lg  gap-6   top-level page sections
//   xl  gap-8   hero-spaced landing sections
//
// Layout-only: it owns `flex flex-col` + the gap, nothing else. `as` renders a
// semantic element (`section`/`ul`/`ol`) without losing the rhythm. For a
// titled section use `Section`; for the page's outer width/padding use
// `PageMain`.

export type StackGap = "2xs" | "xs" | "sm" | "md" | "lg" | "xl";

const GAPS: Record<StackGap, string> = {
  "2xs": "gap-1.5",
  xs: "gap-2",
  sm: "gap-3",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
};

type StackProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  gap?: StackGap;
  children: ReactNode;
};

export function Stack({
  as: Tag = "div",
  gap = "md",
  className = "",
  children,
  ...rest
}: StackProps) {
  const cls = cn("flex flex-col", GAPS[gap], className);
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
