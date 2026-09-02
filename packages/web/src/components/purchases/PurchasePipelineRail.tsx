import type { PurchaseKind, PurchaseStatus } from "@boardgames/core/protocol";
import { Fragment } from "react";
import { cn } from "../../lib/cn";
import { TONE_RING, type Tone } from "../ui/tones";
import { railFor, STATUS_LABEL, STATUS_TONE } from "./purchase-rows";

// The stage rail across a purchase card's bottom: every stop the purchase's
// pipeline has (crowdfunding 4, retail 3), colored up to the current one in
// the current status's tone. Cancelled renders a dead track — there is no
// progress to show, only the terminus.

// Solid dot fills per tone. Full literals — Tailwind can't see assembled
// class names (rule documented in tones.ts).
const TONE_DOT: Record<Tone, string> = {
  accent: "bg-accent-400",
  amber: "bg-amber-400",
  sky: "bg-sky-400",
  emerald: "bg-emerald-400",
  rose: "bg-rose-400",
  purple: "bg-purple-400",
  orange: "bg-orange-400",
  cyan: "bg-cyan-400",
  neutral: "bg-white/30",
};

export function PurchasePipelineRail({
  kind,
  status,
}: {
  kind: PurchaseKind;
  status: PurchaseStatus;
}) {
  const rail = railFor(kind, status);
  if (rail === null) {
    return (
      <div role="img" aria-label="Cancelled" className="flex items-center gap-2">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-3xs font-medium text-rose-300">× Cancelled</span>
      </div>
    );
  }
  const tone = STATUS_TONE[status];
  return (
    <div
      role="img"
      aria-label={`Stage ${rail.activeIndex + 1} of ${rail.stops.length}: ${STATUS_LABEL[status]}`}
      className="flex items-start gap-1.5"
    >
      {rail.stops.map((stop, i) => (
        <Fragment key={stop}>
          {i > 0 && (
            <span
              className={cn(
                "mt-[3px] h-px flex-1",
                i <= rail.activeIndex ? cn(TONE_DOT[tone], "opacity-40") : "bg-white/10",
              )}
            />
          )}
          <span className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "h-[7px] w-[7px] rounded-full",
                i < rail.activeIndex && cn(TONE_DOT[tone], "opacity-60"),
                i === rail.activeIndex && cn(TONE_DOT[tone], TONE_RING[tone]),
                i > rail.activeIndex && "bg-white/10",
              )}
            />
            <span
              className={cn(
                "hidden text-3xs leading-none sm:block",
                i === rail.activeIndex ? "font-medium text-fg-secondary" : "text-fg-disabled",
              )}
            >
              {STATUS_LABEL[stop]}
            </span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}
