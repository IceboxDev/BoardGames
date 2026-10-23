import type { Learning } from "@boardgames/core/games/chess/trainer/drill";
import { cn } from "../../../../lib/cn";

/** What you know here at a glance: learnt, learning, new, then still being analysed. */
export function KnowledgeBar({ l, className }: { l: Learning; className?: string }) {
  const parts = [
    { id: "learnt", n: l.learnt, cls: "bg-accent-300" },
    { id: "learning", n: l.learning, cls: "bg-accent-300/45" },
    { id: "fresh", n: l.fresh, cls: "bg-fg-strong/15" },
    { id: "pending", n: l.pending, cls: "opacity-60", hatch: true },
  ];
  const total = parts.reduce((t, p) => t + p.n, 0);
  return (
    <span
      aria-hidden="true"
      className={cn("flex h-1 w-full overflow-hidden rounded-full bg-surface-950/40", className)}
    >
      {parts.map((p) =>
        p.n > 0 ? (
          <span
            key={p.id}
            className={p.cls}
            style={{
              width: `${(p.n / total) * 100}%`,
              background:
                "hatch" in p
                  ? "repeating-linear-gradient(135deg, var(--color-fg-muted) 0 2px, transparent 2px 4px)"
                  : undefined,
            }}
          />
        ) : null,
      )}
    </span>
  );
}
