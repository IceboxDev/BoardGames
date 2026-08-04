import type { ReactNode } from "react";

// Tinted in-board dialog panel — the "resolve this now" surface a game shows
// above the fan (defuse, favor, steal, nope window, peek). Exploding Kittens
// had six hand-spelled copies of the same `rounded-xl border border-{hue}-700/50
// bg-{hue}-950/40` chrome, one hue apart. Tone communicates stakes:
//
//   danger    — rose: you are about to explode.
//   success   — emerald: threat resolved (kitten defused).
//   warning   — amber: another player demands something (favor).
//   interrupt — yellow: reaction window (nope).
//   arcane    — purple: information / targeting powers (see-the-future, steal).
//
// This is a GAME surface, not app chrome — hence its home in game-layout/ and
// its saturated -950 fills, which the app-shell `Surface` deliberately lacks.

export type GameDialogTone = "danger" | "success" | "warning" | "interrupt" | "arcane";

const TONES: Record<GameDialogTone, { panel: string; title: string }> = {
  danger: { panel: "border-rose-700/50 bg-rose-950/50", title: "text-rose-300" },
  success: { panel: "border-emerald-700/50 bg-emerald-950/40", title: "text-emerald-300" },
  warning: { panel: "border-amber-700/50 bg-amber-950/40", title: "text-amber-300" },
  interrupt: { panel: "border-yellow-700/50 bg-yellow-950/40", title: "text-yellow-300" },
  arcane: { panel: "border-purple-700/50 bg-purple-950/40", title: "text-purple-300" },
};

type GameDialogPanelProps = {
  tone: GameDialogTone;
  /** Bold tone-colored heading ("🔮 See the Future"). */
  title?: ReactNode;
  /** Muted explainer under the title. */
  subtitle?: ReactNode;
  /** Center the content (hero-style panels). */
  center?: boolean;
  /** Roomier padding for hero-style panels. */
  spacious?: boolean;
  className?: string;
  children?: ReactNode;
};

export function GameDialogPanel({
  tone,
  title,
  subtitle,
  center = false,
  spacious = false,
  className = "",
  children,
}: GameDialogPanelProps) {
  const t = TONES[tone];
  const cls = [
    "rounded-xl border",
    t.panel,
    spacious ? "p-6" : "p-4",
    center ? "text-center" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls}>
      {title && <p className={`text-sm font-medium ${t.title}`}>{title}</p>}
      {subtitle && <p className="mt-1 text-xs text-fg-secondary">{subtitle}</p>}
      {children != null && <div className={title || subtitle ? "mt-3" : ""}>{children}</div>}
    </div>
  );
}
