import type { ReactNode } from "react";

// The standard "Title · message" status row for a game's fanActions bar.
// Parks named this pattern (`Prompt`) and kept it private; lost-cities,
// durak, exploding-kittens, and sushi-go each re-typed the identical markup —
// including the same cyan/amber turn ternary and the same pulsing amber
// "waiting" dot. One row, two tones, one dot.
//
//   tone="active"  — cyan title: it's the local player's turn / their prompt.
//   tone="waiting" — amber title: opponent / AI is acting; pair with `pulse`.
//
// For the richer "AI thinking + elapsed timer" treatment keep using
// `AiThinkingIndicator`; this row is the lightweight sibling.

type PromptRowProps = {
  /** Bold lead-in ("Your turn", "Opponent"). Omit for a bare message row. */
  title?: ReactNode;
  tone?: "active" | "waiting";
  /** Instruction / status after the separator dot. */
  message?: ReactNode;
  /** Show the pulsing amber activity dot (opponent/AI acting). */
  pulse?: boolean;
  /** Trailing inline controls (chips, extra hints). */
  children?: ReactNode;
};

export function PromptRow({
  title,
  tone = "active",
  message,
  pulse = false,
  children,
}: PromptRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {title && (
        <span
          className={`text-xs font-semibold ${tone === "active" ? "text-cyan-400" : "text-amber-400"}`}
        >
          {title}
        </span>
      )}
      {title && message && <span className="text-fg-muted">&middot;</span>}
      {message && <span className="text-xs text-fg-secondary">{message}</span>}
      {pulse && (
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
      )}
      {children}
    </div>
  );
}
