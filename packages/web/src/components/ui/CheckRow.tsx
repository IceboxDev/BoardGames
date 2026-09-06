import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { CheckIcon } from "../icons";
import { OPTION_ROW_BASE, OPTION_ROW_IDLE, OPTION_ROW_SELECTED } from "./option-row-chrome";

// ── CheckRow ─────────────────────────────────────────────────────────────
//
// A multi-select list row: the whole surface is a `<label>` around a
// visually-hidden native checkbox, so it keeps the browser's keyboard,
// form and assistive-tech behaviour while the row draws the state. This is
// the inventory pattern (owned games, EXIT boxes, card decks), which three
// files had each re-rolled with the same selected pair and three idle
// treatments.
//
// `title` may be a composed node (a name beside a suit glyph); `description`
// is the muted second line; `leading` a thumbnail; `trailing` a badge.

type CheckRowProps = {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  /** Row density — `sm` for long lists, `md` (default) for grids. */
  padding?: "sm" | "md";
  /** Accessible name when `title` alone would not describe the option. */
  "aria-label"?: string;
  className?: string;
};

const PADDINGS = { sm: "gap-2.5 px-2.5 py-1.5", md: "gap-3 p-2.5" } as const;

export function CheckRow({
  checked,
  onChange,
  disabled = false,
  leading,
  title,
  description,
  trailing,
  padding = "md",
  "aria-label": ariaLabel,
  className,
}: CheckRowProps) {
  return (
    <label
      className={cn(
        OPTION_ROW_BASE,
        PADDINGS[padding],
        checked ? OPTION_ROW_SELECTED : OPTION_ROW_IDLE,
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {/* biome-ignore lint/correctness/noRestrictedElements: sr-only checkbox behind the row surface — the row IS the control's chrome */}
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel}
        className="sr-only"
      />
      {leading}
      <span className="min-w-0 flex-1 text-xs">
        <span className="block truncate font-semibold text-fg-primary">{title}</span>
        {description && (
          <span className="block truncate text-3xs text-fg-muted">{description}</span>
        )}
      </span>
      {trailing}
      {checked && <CheckIcon className="h-4 w-4 shrink-0 text-accent-300" />}
    </label>
  );
}
