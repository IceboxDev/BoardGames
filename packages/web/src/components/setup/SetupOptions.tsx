import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { MicroLabel } from "../ui/Label";
import { Surface } from "../ui/Surface";

// ── The game's options, across the full width ──────────────────────────
//
// One panel holding every option a game offers besides the main choice,
// laid out on a 12-column grid: each option asks for a width (`s` = a
// quarter, `m` = a third, `l` = a half, `full`), options fill rows left to
// right, and the last option in a row stretches to close the gap — so the
// panel always spans the whole width and never leaves a hole. Two columns
// on a small screen, one on a phone.
//
// An option that only applies sometimes stays in place, disabled, with its
// note saying why — the layout never shifts when another option changes.

export type SetupOptionSpan = "s" | "m" | "l" | "full";

export interface SetupOption {
  id: string;
  label: ReactNode;
  /** How much of the row it asks for. Default `s`. */
  span?: SetupOptionSpan;
  control: ReactNode;
  /** A short line under the control (a caption, or why it's disabled). */
  note?: ReactNode;
  /** Dims the tile; the control itself must be disabled by the caller. */
  disabled?: boolean;
}

const COLUMNS: Record<SetupOptionSpan, number> = { s: 3, m: 4, l: 6, full: 12 };

/**
 * Each option's final column count: options fill 12-column rows in order,
 * and the last option of each row takes whatever the row has left.
 */
export function packSpans(spans: readonly SetupOptionSpan[]): number[] {
  const out: number[] = [];
  let used = 0;
  let rowStart = 0;
  spans.forEach((span, i) => {
    const want = COLUMNS[span];
    if (used + want > 12) {
      const last = out.length - 1;
      out[last] = (out[last] ?? 0) + (12 - used);
      used = 0;
      rowStart = i;
    }
    out.push(want);
    used += want;
  });
  if (out.length > rowStart) {
    const last = out.length - 1;
    out[last] = (out[last] ?? 0) + (12 - used);
  }
  return out;
}

// Static class names so Tailwind sees every one.
const LG_SPAN: Record<number, string> = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  7: "lg:col-span-7",
  8: "lg:col-span-8",
  9: "lg:col-span-9",
  10: "lg:col-span-10",
  11: "lg:col-span-11",
  12: "lg:col-span-12",
};

export function SetupOptions({ options }: { options: readonly SetupOption[] }) {
  if (options.length === 0) return null;
  const spans = packSpans(options.map((o) => o.span ?? "s"));
  return (
    <Surface
      variant="panel"
      padding="lg"
      className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-12"
    >
      {options.map((option, i) => (
        <div
          key={option.id}
          className={cn(
            "flex min-w-0 flex-col gap-1.5",
            (option.span === "l" || option.span === "full") && "sm:col-span-2",
            LG_SPAN[spans[i] ?? 3],
            option.disabled && "opacity-60",
          )}
        >
          <MicroLabel className="font-semibold text-fg-secondary">{option.label}</MicroLabel>
          <div className="flex min-w-0 flex-wrap items-center gap-2">{option.control}</div>
          {option.note && <p className="text-xs leading-snug text-fg-muted">{option.note}</p>}
        </div>
      ))}
    </Surface>
  );
}
