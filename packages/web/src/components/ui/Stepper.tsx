import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { MinusIcon, PlusIcon } from "../icons";
import { IconButton } from "./IconButton";

// ── Stepper ──────────────────────────────────────────────────────────────
//
// A bounded integer picker: minus, the number, plus. The value is the
// hero (a display-size numeral), the buttons are the same bordered pills
// every setup screen uses. `caption` reads the value back in words
// ("You + 3 bots", "3 seated · 1 waiting") so the number never stands alone.

type StepperProps = {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  /** Accessible name of the quantity ("Player count", "Seats"). */
  label: string;
  caption?: ReactNode;
  disabled?: boolean;
  /** `md` (default) for setup screens, `sm` for dialogs. */
  size?: "sm" | "md";
  className?: string;
};

const NUMERAL = {
  sm: "w-14 text-2xl",
  md: "w-20 text-3xl",
} as const;
const BUTTON = { sm: "h-8 w-8", md: "h-10 w-10" } as const;

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  caption,
  disabled = false,
  size = "md",
  className,
}: StepperProps) {
  const canDecrement = !disabled && value > min;
  const canIncrement = !disabled && value < max;
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <fieldset className="flex items-center gap-1 border-0 p-0" aria-label={label}>
        <IconButton
          variant="bordered"
          shape="pill"
          size={size}
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={!canDecrement}
          onClick={() => onChange(value - 1)}
          icon={<MinusIcon className="h-4 w-4" />}
          className={BUTTON[size]}
        />
        <output
          aria-label={label}
          className={cn(
            "flex flex-col items-center justify-center font-extrabold tabular-nums tracking-tight text-fg-strong",
            NUMERAL[size],
          )}
        >
          {value}
        </output>
        <IconButton
          variant="bordered"
          shape="pill"
          size={size}
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={!canIncrement}
          onClick={() => onChange(value + 1)}
          icon={<PlusIcon className="h-4 w-4" />}
          className={BUTTON[size]}
        />
      </fieldset>
      {caption && <p className="text-center text-xs text-fg-muted">{caption}</p>}
    </div>
  );
}
