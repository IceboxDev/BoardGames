import type { ReactNode } from "react";
import CardTag from "./CardTag";

// ---------------------------------------------------------------------------
// Public types — declarative span-based content model
// ---------------------------------------------------------------------------

export type LogVariant =
  | "action"
  | "info"
  | "danger"
  | "success"
  | "warning"
  | "neutral"
  | "special";

export interface LogTextSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  color?: string;
}

export interface LogCardRef {
  card: string;
  color?: string;
  imageUrl?: string;
  /** Custom tooltip content (overrides default image tooltip). */
  tooltipContent?: ReactNode;
}

/** A span is plain text, styled text, or a card reference. */
export type LogSpan = string | LogTextSpan | LogCardRef;

export interface LogAction {
  key: string | number;
  icon: string;
  spans: LogSpan[];
  variant: LogVariant;
}

export interface LogBlock {
  key: string | number;
  label: string;
  actions: LogAction[];
}

// ---------------------------------------------------------------------------
// Variant → text color
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
// Span renderer
// ---------------------------------------------------------------------------

function renderSpan(span: LogSpan, index: number) {
  if (typeof span === "string") {
    return <span key={index}>{span}</span>;
  }
  if ("card" in span) {
    return (
      <CardTag
        key={index}
        label={span.card}
        color={span.color}
        imageUrl={span.imageUrl}
        tooltipContent={span.tooltipContent}
      />
    );
  }
  // LogTextSpan
  const classes: string[] = [];
  if (span.bold) classes.push("font-semibold");
  if (span.italic) classes.push("italic");
  if (span.strikethrough) classes.push("line-through");
  if (span.underline) classes.push("underline");
  return (
    <span
      key={index}
      className={classes.length > 0 ? classes.join(" ") : undefined}
      style={span.color ? { color: span.color } : undefined}
    >
      {span.text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ActionLogProps {
  blocks: LogBlock[];
  emptyMessage?: string;
}

export default function ActionLog({
  blocks,
  emptyMessage = "Game log will appear here...",
}: ActionLogProps) {
  if (blocks.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-gray-600 italic">
        {emptyMessage}
      </div>
    );
  }

  // Newest-first: reverse block order
  const reversed = [...blocks].reverse();

  return (
    <div className="flex flex-col gap-4">
      {reversed.map((block) => (
        <div key={block.key}>
          {/* Block separator — label + hairline */}
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {block.label}
            </span>
            <div className="h-px flex-1 bg-gray-800" />
          </div>

          {/* Actions — newest first */}
          <div className="flex flex-col gap-1.5">
            {[...block.actions].reverse().map((action) => {
              const textClass = VARIANT_TEXT[action.variant];
              return (
                <div
                  key={action.key}
                  className={`flex items-start gap-2 text-[13px] leading-relaxed ${textClass}`}
                >
                  <span className="mt-px shrink-0">{action.icon}</span>
                  <span className="min-w-0">
                    {action.spans.map((span, i) => renderSpan(span, i))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
