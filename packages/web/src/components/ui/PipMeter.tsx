import { cn } from "../../lib/cn";

// A count drawn as pips: agents found of 9, guesses left of 3. Unlike
// `ProgressBar` (a continuous share), each pip IS one thing, so the reader can
// count them. The first `filled` pips take `fillClass`, the rest `restClass`.
//   stretch — pips share the row's width (a rail meter)
//   dots    — fixed round dots (an inline count beside a label)

export function PipMeter({
  total,
  filled,
  fillClass,
  restClass = "bg-fill-strong",
  variant = "stretch",
  title,
  className,
}: {
  total: number;
  filled: number;
  /** Background class of a filled pip (a token, e.g. `bg-cn-green`). */
  fillClass: string;
  restClass?: string;
  variant?: "stretch" | "dots";
  title?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("flex", variant === "stretch" ? "w-full gap-0.5" : "gap-1", className)}
      {...(title ? { title, role: "img", "aria-label": title } : { "aria-hidden": true })}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: pips are positional
          key={i}
          className={cn(
            "rounded-full",
            variant === "stretch" ? "h-1.5 min-w-0 flex-1" : "h-2 w-2",
            i < filled ? fillClass : restClass,
          )}
        />
      ))}
    </span>
  );
}
