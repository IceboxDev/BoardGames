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
      {mark.icon && (
        <img src={mark.icon} alt="" aria-hidden width={16} height={16} className="size-4" />
      )}
      <span className="sr-only">Source: </span>
      {mark.short}
    </span>
  );
}
