import type { ReactNode } from "react";

interface GameOverStatsProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
}

export function GameOverStats({ children, columns = 2 }: GameOverStatsProps) {
  const colsClass =
    columns === 4 ? "grid-cols-2 sm:grid-cols-4" : columns === 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <div
      className={`grid gap-3 rounded-xl border border-gray-700/50 bg-surface-800 p-4 ${colsClass}`}
    >
      {children}
    </div>
  );
}

export function StatItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${highlight ? "text-yellow-400" : "text-white"}`}>
        {value}
        {highlight && " \u2605"}
      </div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
