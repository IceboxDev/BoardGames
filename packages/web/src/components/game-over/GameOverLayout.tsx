import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/PageHeader";

export interface GameOverAction {
  label: string;
  onClick: () => void;
  variant: "primary" | "secondary";
}

interface GameOverLayoutProps {
  /** e.g. "You Win!", "Defeat", "Game Complete" */
  headline: string;
  headlineColor?: "win" | "lose" | "draw" | "neutral";
  /** e.g. "Game lasted 12 turns" */
  subtitle?: string;
  /** Optional emoji rendered above the headline */
  emoji?: string;
  /** Game-specific content (stats tables, breakdowns, charts) */
  children?: ReactNode;
  /** Ordered: first item with variant="primary" renders as primary. */
  actions: readonly GameOverAction[];
  /** Vertically center the results while they're shorter than the screen (Pandemic, Codenames). */
  centered?: boolean;
  /** Use the full width of a wide screen (rich results that lay out in columns). */
  wide?: boolean;
}

const HEADLINE_COLORS = {
  win: "text-emerald-400",
  lose: "text-rose-400",
  draw: "text-fg-secondary",
  neutral: "text-fg-strong",
} as const;

/**
 * The shared game-over screen. It fills the game route's fixed-height main:
 * the headline and the game's results scroll, the actions stay pinned in a
 * footer — a long result (a move-by-move analysis, a big score table) never
 * pushes Play Again off the screen.
 */
export function GameOverLayout({
  headline,
  headlineColor = "neutral",
  subtitle,
  emoji,
  children,
  actions,
  centered,
  wide = false,
}: GameOverLayoutProps) {
  const width = wide ? "max-w-screen-2xl" : "max-w-2xl";
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", centered && "p-4")}>
        <div
          className={cn(
            "mx-auto w-full animate-card-enter px-6 py-8",
            width,
            centered && "my-auto",
          )}
        >
          {/* Header — PageHeader owns the title/subtitle typography; the win/lose
              color rides in via a child <span> (it overrides PageHeader's
              text-white), and the emoji stays a sibling decoration. */}
          <div className="mb-8 flex flex-col items-center">
            {emoji && <div className="mb-2 text-5xl">{emoji}</div>}
            <PageHeader
              align="center"
              size="lg"
              title={<span className={HEADLINE_COLORS[headlineColor]}>{headline}</span>}
              subtitle={subtitle}
            />
          </div>

          {children}
        </div>
      </div>

      {actions.length > 0 && (
        <footer className="shrink-0 border-t border-line-soft bg-surface-950/80 px-6 py-3 backdrop-blur-md">
          <div className={cn("mx-auto flex w-full flex-wrap justify-center gap-3", width)}>
            {actions.map((action) => (
              <Button
                key={action.label}
                variant={action.variant}
                size="lg"
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}
