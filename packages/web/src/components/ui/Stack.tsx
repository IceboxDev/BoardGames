import type { ElementType, HTMLAttributes, ReactNode } from "react";

// ── Stack ────────────────────────────────────────────────────────────────
//
// The vertical-rhythm primitive. Pages were spacing their top-level sections
// three different ways — a `flex flex-col gap-6` wrapper here, a sibling `mt-6`
// there, per-child `mb-2/4/6` elsewhere — so the same product had three
// rhythms. `Stack` makes "a column of sections with a consistent gap" a single
// named choice instead of a per-page decision.
//
// Gap scale (maps to Tailwind `gap-*`):
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

export type StackGap = "xs" | "sm" | "md" | "lg" | "xl";

const GAPS: Record<StackGap, string> = {
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
  const cls = ["flex flex-col", GAPS[gap], className].filter(Boolean).join(" ");
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
