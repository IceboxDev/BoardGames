import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Public types — each game maps its internal entries into these
// ---------------------------------------------------------------------------

export type LogVariant =
  | "action"
  | "info"
  | "danger"
  | "success"
  | "warning"
  | "neutral"
  | "special";

export interface LogEntry {
  key: string | number;
  icon: string;
  content: ReactNode;
  variant: LogVariant;
}

export interface TurnGroup {
  key: string | number;
  label: string;
  entries: LogEntry[];
}

// ---------------------------------------------------------------------------
// Variant → text color only (clean, no backgrounds)
// ---------------------------------------------------------------------------

const VARIANT_TEXT: Record<LogVariant, string> = {
  action: "text-gray-200",
  info: "text-gray-400",
  danger: "text-red-300",
  success: "text-emerald-300",
  warning: "text-amber-300",
  neutral: "text-gray-400",
  special: "text-purple-300",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ActionLogProps {
  groups: TurnGroup[];
  emptyMessage?: string;
  /** Max height CSS value. Defaults to "calc(100vh - 10rem)". */
  maxHeight?: string;
}

export default function ActionLog({
  groups,
  emptyMessage = "Game log will appear here...",
  maxHeight = "calc(100vh - 10rem)",
}: ActionLogProps) {
  // Newest-first: reverse group order
  const reversed = [...groups].reverse();

  if (groups.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-gray-600 italic">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-4 overflow-y-auto overscroll-contain pr-1 scrollbar-thin"
      style={{ maxHeight }}
    >
      {reversed.map((group) => (
        <div key={group.key}>
          {/* Turn separator — minimal label + hairline */}
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {group.label}
            </span>
            <div className="h-px flex-1 bg-gray-800" />
          </div>

          {/* Entries */}
          <div className="flex flex-col gap-1.5">
            {group.entries.map((entry) => {
              const textClass = VARIANT_TEXT[entry.variant];
              return (
                <div
                  key={entry.key}
                  className={`flex items-start gap-2 text-[13px] leading-relaxed ${textClass}`}
                >
                  <span className="mt-px shrink-0">{entry.icon}</span>
                  <span className="min-w-0">{entry.content}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
