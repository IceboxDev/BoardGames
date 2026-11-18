import { cn } from "../../lib/cn";

// Three breathing dots: someone (a person or an AI) is thinking. One recipe
// for every roster row and status line — the stagger lives here, not in each
// caller's inline style.

const SIZE = { xs: "h-1 w-1", sm: "h-1.5 w-1.5" } as const;
const GAP = { xs: "gap-0.5", sm: "gap-1" } as const;
const TONE = { amber: "bg-amber-300", muted: "bg-fg-muted" } as const;
const DELAYS_MS = [0, 140, 280] as const;

export function ThinkingDots({
  size = "xs",
  tone = "amber",
  title,
  className,
}: {
  size?: keyof typeof SIZE;
  tone?: keyof typeof TONE;
  /** Tooltip; without one the dots are decoration (aria-hidden). */
  title?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("flex shrink-0", GAP[size], className)}
      {...(title ? { title, role: "status", "aria-label": title } : { "aria-hidden": true })}
    >
      {DELAYS_MS.map((delay) => (
        <span
          key={delay}
          className={cn(
            "animate-bounce rounded-full motion-reduce:animate-pulse",
            SIZE[size],
            TONE[tone],
          )}
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
