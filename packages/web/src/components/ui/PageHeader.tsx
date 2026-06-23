import type { ReactNode } from "react";

// ── PageHeader ───────────────────────────────────────────────────────────
//
// The single page-title block. Replaces the per-page hand-rolled headers that
// each invented their own container (grid vs flex), title size (text-xl …
// text-5xl), eyebrow kicker, and spacing. One contract:
//   • eyebrow  — optional uppercase kicker above the title ("Welcome").
//   • title    — white (the brightest emphasis tier).
//   • subtitle — muted supporting line.
//   • badge    — inline element after the title (e.g. a count Chip).
//   • actions  — right-aligned controls (Buttons); wrap below on phones.
//   • align    — `left` (default, splits title/actions) or `center` (auth /
//                hero pages: stacked, centered).
//
// Sizes map to the page's altitude:
//   sm  — dense data pages (history, admin sub-views)
//   md  — default app pages
//   lg  — gallery / section pages
//   xl  — hero / profile landing
//
// Owns no outer margin — the parent layout (PageMain gap, or an explicit
// `className="mb-…"`) controls the gap to the content below.

export type PageHeaderSize = "sm" | "md" | "lg" | "xl";
export type PageHeaderAlign = "left" | "center";

type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Uppercase kicker rendered above the title. */
  eyebrow?: ReactNode;
  /** Inline element rendered immediately after the title (e.g. a status Chip). */
  badge?: ReactNode;
  /** Right-aligned controls (Buttons). Wraps below the title on phones. */
  actions?: ReactNode;
  size?: PageHeaderSize;
  align?: PageHeaderAlign;
  className?: string;
};

const TITLE_SIZE: Record<PageHeaderSize, string> = {
  sm: "text-xl font-semibold",
  md: "text-2xl font-bold",
  lg: "text-3xl font-bold sm:text-4xl",
  xl: "text-4xl font-bold sm:text-5xl",
};

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  badge,
  actions,
  size = "md",
  align = "left",
  className = "",
}: PageHeaderProps) {
  const center = align === "center";

  const outer = [
    center
      ? "flex flex-col items-center gap-3 text-center"
      : "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={outer}>
      <div className={center ? "" : "min-w-0"}>
        {eyebrow && (
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-accent-400">
            {eyebrow}
          </p>
        )}
        <div className={`flex items-center gap-3 ${center ? "justify-center" : ""}`}>
          <h1 className={`${TITLE_SIZE[size]} tracking-tight text-white`}>{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {actions && (
        <div className={`flex shrink-0 items-center gap-2 ${center ? "justify-center" : ""}`}>
          {actions}
        </div>
      )}
    </header>
  );
}
