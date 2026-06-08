import { Spinner } from "./Spinner";

// The standard inline loading row — a small spinner + label. Replaces the
// scattered `<p>Loading…</p>` / `Finding games…` / `Loading inventory…`
// one-offs so every async wait reads identically. Pass `fill` to center it in
// the available height for full-area loads.

type LoadingStateProps = {
  label?: string;
  /** Grow + vertically center within the parent (full-area loads). */
  fill?: boolean;
  className?: string;
};

export function LoadingState({
  label = "Loading…",
  fill = false,
  className = "",
}: LoadingStateProps) {
  const cls = [
    "flex items-center justify-center gap-2.5 text-sm text-fg-muted",
    fill ? "min-h-0 flex-1 py-10" : "py-6",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div role="status" className={cls}>
      <Spinner size="sm" />
      <span>{label}</span>
    </div>
  );
}
