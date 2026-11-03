import { cn } from "../../../../lib/cn";
import { sourceMarkOf } from "../../source-marks";

/**
 * Which game a question's wording comes from (or Homebrew): the source's
 * square stamp, once generated, and its short name. The full name is the
 * tooltip.
 */
export function SourceLabel({ source, className }: { source: string; className?: string }) {
  const mark = sourceMarkOf(source);
  return (
    <span
      title={mark.title}
      className={cn(
        "inline-flex items-center gap-1 text-2xs font-semibold text-fg-secondary",
        className,
      )}
    >
      <SourceMarkIcon source={source} className="size-4" />
      <span className="sr-only">Source: </span>
      {mark.short}
    </span>
  );
}

/** A source's square stamp alone (decorative: its name is always beside it). */
export function SourceMarkIcon({ source, className }: { source: string; className?: string }) {
  const icon = sourceMarkOf(source).icon;
  if (!icon) return null;
  return (
    <img
      src={icon}
      alt=""
      aria-hidden
      width={32}
      height={32}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
