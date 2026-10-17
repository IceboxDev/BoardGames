/**
 * A slim status line under the colour switch, in a slot of its own that never
 * changes height: what the open colour's tree is doing, with a hairline of
 * progress while it's busy, and a quiet summary when it isn't.
 */
import { cn } from "../../../../lib/cn";
import type { TreeBuild } from "../useTreeBuild";
import { buildLabel } from "./status-text";

export function BuildStatus({ build }: { build: TreeBuild | null }) {
  const busy = !!build && build.phase !== "idle";
  const p = build?.progress;
  const value = !build
    ? null
    : build.phase === "indexing" && build.indexing
      ? build.indexing.done / Math.max(1, build.indexing.total)
      : p
        ? p.settled / Math.max(1, p.games)
        : null;
  const text = !build ? "" : build.error ? build.error : buildLabel(build);
  return (
    <div className="flex h-6 shrink-0 flex-col justify-end gap-1 pb-0.5">
      <span
        className={cn(
          "truncate text-2xs",
          build?.error ? "text-rose-300" : busy ? "text-fg-secondary" : "text-fg-muted",
        )}
        title={text}
      >
        {text}
      </span>
      <span className="relative h-0.5 overflow-hidden rounded-full bg-fill">
        {busy &&
          (value === null ? (
            <span className="absolute inset-y-0 w-1/3 animate-pulse rounded-full bg-accent-400/60" />
          ) : (
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-accent-400 transition-all"
              style={{ width: `${Math.max(3, value * 100)}%` }}
            />
          ))}
      </span>
    </div>
  );
}
