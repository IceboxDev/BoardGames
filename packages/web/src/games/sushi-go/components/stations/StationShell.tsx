import type { ReactNode } from "react";

export type StationTheme =
  | "maki"
  | "nigiri"
  | "tempura"
  | "sashimi"
  | "dumpling"
  | "pudding"
  | "chopsticks";

const THEMES: Record<
  StationTheme,
  {
    border: string;
    bg: string;
    label: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  maki: {
    border: "border-red-500/15",
    bg: "bg-red-500/[0.03]",
    label: "text-red-400/70",
    badgeBg: "bg-red-500/15",
    badgeText: "text-red-300",
  },
  nigiri: {
    border: "border-rose-500/15",
    bg: "bg-rose-500/[0.03]",
    label: "text-rose-400/70",
    badgeBg: "bg-rose-500/15",
    badgeText: "text-rose-300",
  },
  tempura: {
    border: "border-amber-500/15",
    bg: "bg-amber-500/[0.03]",
    label: "text-amber-400/70",
    badgeBg: "bg-amber-500/15",
    badgeText: "text-amber-300",
  },
  sashimi: {
    border: "border-emerald-500/15",
    bg: "bg-emerald-500/[0.03]",
    label: "text-emerald-400/70",
    badgeBg: "bg-emerald-500/15",
    badgeText: "text-emerald-300",
  },
  dumpling: {
    border: "border-yellow-500/15",
    bg: "bg-yellow-500/[0.03]",
    label: "text-yellow-400/70",
    badgeBg: "bg-yellow-500/15",
    badgeText: "text-yellow-300",
  },
  pudding: {
    border: "border-pink-500/15",
    bg: "bg-pink-500/[0.03]",
    label: "text-pink-400/70",
    badgeBg: "bg-pink-500/15",
    badgeText: "text-pink-300",
  },
  chopsticks: {
    border: "border-gray-500/15",
    bg: "bg-gray-500/[0.03]",
    label: "text-gray-400/70",
    badgeBg: "bg-gray-500/15",
    badgeText: "text-gray-300",
  },
};

interface StationShellProps {
  theme: StationTheme;
  emoji: string;
  label: string;
  badge?: string;
  badgeDimmed?: boolean;
  compact?: boolean;
  children: ReactNode;
}

export default function StationShell({
  theme,
  emoji,
  label,
  badge,
  badgeDimmed,
  compact,
  children,
}: StationShellProps) {
  const t = THEMES[theme];
  return (
    <div
      className={`rounded-xl border ${t.border} ${t.bg} ${compact ? "px-1.5 py-1" : "px-2.5 py-2"}`}
    >
      <div className={`flex items-center gap-2 ${compact ? "mb-0.5" : "mb-1.5"}`}>
        <span
          className={`${compact ? "text-[9px]" : "text-[10px]"} font-semibold uppercase tracking-wider ${t.label}`}
        >
          {emoji} {label}
        </span>
        {badge && (
          <span
            className={`rounded-full px-1.5 py-px ${compact ? "text-[9px]" : "text-[10px]"} font-bold tabular-nums ${t.badgeBg} ${t.badgeText} ${badgeDimmed ? "opacity-40" : ""}`}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
