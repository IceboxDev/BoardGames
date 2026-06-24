import type { ReactNode } from "react";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/PageHeader";

interface GameOverAction {
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
  actions: GameOverAction[];
  /** Vertically center in viewport (for canvas/cooperative games like Pandemic). */
  centered?: boolean;
}

const HEADLINE_COLORS = {
  win: "text-emerald-400",
  lose: "text-rose-400",
  draw: "text-fg-secondary",
  neutral: "text-white",
} as const;

export function GameOverLayout({
  headline,
  headlineColor = "neutral",
  subtitle,
  emoji,
  children,
  actions,
  centered,
}: GameOverLayoutProps) {
  const inner = (
    <div className="mx-auto w-full max-w-2xl animate-card-enter px-6 py-8">
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

      {/* Game-specific content */}
      {children && <div className="mb-8">{children}</div>}

      {/* Actions */}
      {actions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3">
          {actions.map((action) => (
            <Button key={action.label} variant={action.variant} size="lg" onClick={action.onClick}>
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );

  if (centered) {
    return <div className="flex min-h-0 flex-1 items-center justify-center p-4">{inner}</div>;
  }

  return inner;
}
