import type { ReactNode } from "react";

// ── PageHeader ───────────────────────────────────────────────────────────
//
// The single page-title block. Replaces the per-page hand-rolled headers that
// each invented their own container (grid vs flex), title size (text-xl /
// text-2xl / text-3xl), and spacing (mb-6 / mb-8 / mt-1.5). One contract:
// title (always white, the brightest-emphasis tier), optional subtitle, an
// optional inline badge next to the title (e.g. a count Chip), and an optional
// right-aligned `actions` slot (Buttons). Stacks under the title on phones,
// splits left/right from `sm:` up.
//
// Sizes map to the page's altitude:
//   sm  — dense data pages (history, admin sub-views)
//   md  — default app pages
//   lg  — hero / gallery pages
//
// Owns no outer margin — the parent layout (PageMain gap, or an explicit
// `className="mb-…"`) controls the gap to the content below.

export type PageHeaderSize = "sm" | "md" | "lg";

type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Inline element rendered immediately after the title (e.g. a status Chip). */
  badge?: ReactNode;
  /** Right-aligned controls (Buttons). Wraps below the title on phones. */
  actions?: ReactNode;
  size?: PageHeaderSize;
  className?: string;
};

const TITLE_SIZE: Record<PageHeaderSize, string> = {
  sm: "text-xl font-semibold",
  md: "text-2xl font-bold",
  lg: "text-3xl font-bold sm:text-4xl",
};

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  size = "md",
  className = "",
}: PageHeaderProps) {
  const outer = [
    "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={outer}>
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className={`${TITLE_SIZE[size]} tracking-tight text-white`}>{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
