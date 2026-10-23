import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRightIcon } from "../../../../components/icons";
import { InteractiveCard, MicroLabel, TONE_BUBBLE } from "../../../../components/ui";
import { DonutChart } from "../../../../components/ui/charts";
import { cn } from "../../../../lib/cn";
import { type Domain, TONE_LIT } from "../../domains";

// One domain as a card: its two-digit label in a bubble (lit when the
// domain has been studied and nothing is due), the name, and whatever the
// screen puts underneath — due/new badges on the hub, the read share in the
// archive. The whole card is one link; the optional corner link is a
// SIBLING positioned over it, never nested (a link inside a link is
// invalid and unreachable by keyboard).

type Props = {
  domain: Domain;
  to: string;
  lit: boolean;
  /**
   * The domain's progress — the ring in the top-right corner: learned facts
   * in the domain's colour, seen-but-still-learning in grey, the learned
   * count in the middle. Counts, not a percentage: a domain holds hundreds
   * of facts, so a share would read 0% for weeks.
   */
  progress?: { seen: number; learned: number; total: number };
  /** Badge row / progress line under the name. */
  children?: ReactNode;
  cta: string;
  corner?: { to: string; label: string };
  className?: string;
};

export function DomainTile({
  domain: d,
  to,
  lit,
  progress,
  children,
  cta,
  corner,
  className,
}: Props) {
  const progressTitle = progress
    ? `${progress.learned} learned · ${progress.seen} seen · ${progress.total} facts`
    : undefined;
  return (
    // The lift lives on the wrapper so the corner link (a sibling — links
    // cannot nest) rises with the card instead of staying behind.
    <div
      className={cn(
        "relative transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        className,
      )}
    >
      <InteractiveCard
        as={Link}
        to={to}
        padding="sm"
        className={cn("flex h-full flex-col gap-3", lit && cn("border", TONE_LIT[d.tone]))}
      >
        <div className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
              lit ? TONE_BUBBLE[d.tone] : "bg-fill text-fg-muted",
            )}
          >
            <span className="text-xs font-bold tabular-nums">{d.label}</span>
          </span>
          {progress && (
            <span title={progressTitle} className="shrink-0">
              <DonutChart
                size={44}
                thickness={5}
                segments={[
                  { value: progress.learned, tone: d.tone, label: "Learned" },
                  {
                    value: Math.max(0, progress.seen - progress.learned),
                    tone: "neutral",
                    label: "Still learning",
                  },
                  {
                    value: Math.max(0, progress.total - progress.seen),
                    color: "transparent",
                  },
                ]}
              >
                <span className="text-2xs font-semibold tabular-nums text-fg-secondary">
                  {progress.learned}
                </span>
              </DonutChart>
              <span className="sr-only">{progressTitle}</span>
            </span>
          )}
        </div>
        <div className="min-w-0">
          <MicroLabel className="truncate">{d.de}</MicroLabel>
          <p className="truncate text-sm font-semibold text-fg-strong">{d.en}</p>
        </div>
        {children}
        <span className="mt-auto flex items-center gap-1 pt-1 text-3xs font-semibold text-accent-300">
          {cta}
          <ArrowRightIcon className="h-2.5 w-2.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </InteractiveCard>
      {corner && (
        <Link
          to={corner.to}
          className="absolute bottom-3 right-3 z-lift rounded-ui-md px-1.5 py-0.5 text-2xs font-medium text-fg-muted transition-colors hover:bg-fill hover:text-fg-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60"
        >
          {corner.label}
        </Link>
      )}
    </div>
  );
}
