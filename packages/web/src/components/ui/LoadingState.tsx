import { cn } from "../../lib/cn";
import { Spinner } from "./Spinner";

// The standard inline loading row — a small spinner + label. Replaces the
// scattered `<p>Loading…</p>` / `Finding games…` / `Loading inventory…`
// one-offs so every async wait reads identically. Pass `fillHeight` to center
// it in the available height for full-area loads (named to match `PageMain`
// and `EmptyState`).

type LoadingStateProps = {
  label?: string;
  /** Grow + vertically center within the parent (full-area loads). */
  fillHeight?: boolean;
  className?: string;
};

export function LoadingState({
  label = "Loading…",
  fillHeight = false,
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center justify-center gap-2.5 text-sm text-fg-muted",
        fillHeight ? "min-h-0 flex-1 py-10" : "py-6",
        className,
      )}
    >
      <Spinner size="sm" />
      <span>{label}</span>
    </div>
  );
}
