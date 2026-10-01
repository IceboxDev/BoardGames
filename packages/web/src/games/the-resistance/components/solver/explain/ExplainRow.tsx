import type { ReactNode } from "react";
import { cn } from "../../../../../lib/cn";

/**
 * A dashboard line that opens its explanation. Everything the Solver shows as
 * a single item — a spy bar, a deduction, a team, a misplay — is one of these.
 */
export function ExplainRow({
  onClick,
  label,
  active,
  className,
  children,
}: {
  onClick: () => void;
  /** Accessible name: "Explain …". */
  label: string;
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/correctness/noRestrictedElements: a whole data row as the hit area (bars, facts, feed items) — no Button variant lays out arbitrary row content
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title="How is this worked out?"
      className={cn(
        "group/explain -mx-2 w-[calc(100%+1rem)] cursor-help rounded-ui-md px-2 py-1 text-left transition-colors hover:bg-fill focus-visible:bg-fill focus-visible:outline-none",
        active && "bg-fill",
        className,
      )}
    >
      {children}
    </button>
  );
}
