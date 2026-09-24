import type { ContentSource } from "@boardgames/core/games/quiztopia/content-types";
import { cn } from "../../../../lib/cn";
import { sourceDomain } from "../../logic/copy";

// The one internet source behind a question — an external link showing the
// page's domain (the title rides along as a tooltip, or in full with
// `variant="full"`), opening in a new tab so a study session is never lost.

type Props = {
  source: ContentSource;
  /** "inline": "Source · de.wikipedia.org ↗"; "full": the page title over its domain. */
  variant?: "inline" | "full";
  /** Caption before the domain (inline only). */
  label?: string;
  /** Show the page title as a tooltip (off where the title would give an answer away). */
  titleTooltip?: boolean;
  className?: string;
};

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60";

export function SourceLink({
  source,
  variant = "inline",
  label = "Source",
  titleTooltip = true,
  className,
}: Props) {
  const domain = sourceDomain(source.url);
  if (variant === "full") {
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        hrefLang={source.lang}
        className={cn(
          "group inline-flex min-w-0 flex-col rounded-ui-md transition-colors",
          FOCUS,
          className,
        )}
      >
        <span className="truncate text-xs font-medium text-accent-300 group-hover:text-accent-200">
          {source.title}
          <span aria-hidden="true"> ↗</span>
        </span>
        <span className="truncate text-2xs text-fg-muted">
          {domain}
          <span className="sr-only"> (opens in a new tab)</span>
        </span>
      </a>
    );
  }
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      hrefLang={source.lang}
      title={titleTooltip ? source.title : undefined}
      className={cn(
        "inline-flex min-w-0 items-center gap-1 rounded-ui-md text-2xs text-fg-muted transition-colors hover:text-fg-secondary",
        FOCUS,
        className,
      )}
    >
      <span className="shrink-0">{label} ·</span>
      <span className="truncate font-medium text-accent-300">{domain}</span>
      <span aria-hidden="true" className="shrink-0 text-accent-300">
        ↗
      </span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
