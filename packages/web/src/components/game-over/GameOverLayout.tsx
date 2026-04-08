import type { ReactNode } from "react";

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
  lose: "text-red-400",
  draw: "text-gray-300",
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
      {/* Header */}
      <div className="mb-8 text-center">
        {emoji && <div className="mb-2 text-5xl">{emoji}</div>}
        <h2 className={`text-3xl font-bold ${HEADLINE_COLORS[headlineColor]}`}>{headline}</h2>
        {subtitle && <p className="mt-2 text-sm text-gray-400">{subtitle}</p>}
      </div>

      {/* Game-specific content */}
      {children && <div className="mb-8">{children}</div>}

      {/* Actions */}
      {actions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3">
          {actions.map((action) =>
            action.variant === "primary" ? (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                {action.label}
              </button>
            ) : (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className="rounded-xl border border-gray-700 bg-surface-800 px-6 py-2.5 text-sm font-semibold text-gray-300 transition hover:bg-surface-700"
              >
                {action.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );

  if (centered) {
    return <div className="flex min-h-0 flex-1 items-center justify-center p-4">{inner}</div>;
  }

  return inner;
}
