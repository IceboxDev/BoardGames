/**
 * The build's status, living inside the folder rail's header instead of a slot
 * of its own: while a build runs, a short line of what it's doing takes the
 * place of the header's count (`BuildStatusText`), and the header's bottom
 * rule fills as progress (`BuildProgressRule`). Once the tree is built both
 * are gone: the count is back and the rule is a plain divider. Nothing moves
 * or resizes either way.
 */
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "../../../../lib/cn";
import type { TreeBuild } from "../useTreeBuild";
import { buildLabel } from "./status-text";

/** `now`, ticking while a build runs (one waiting on lichess sends no progress). */
function useTick(busy: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);
  return now;
}

const isBusy = (build: TreeBuild | null) => !!build && build.phase !== "idle";

/** What the build is doing, or `fallback` (the header's count) when it's doing nothing. */
export function BuildStatusText({
  build,
  fallback,
}: {
  build: TreeBuild | null;
  fallback: ReactNode;
}) {
  const busy = isBusy(build);
  const now = useTick(busy);
  const text = !build ? "" : build.error ? build.error : buildLabel(build, now);
  if (!text) return <>{fallback}</>;
  return (
    <span
      className={cn(
        "w-3/5 min-w-0 shrink-0 truncate text-right text-2xs",
        build?.error ? "text-rose-300" : "text-fg-secondary",
      )}
      title={text}
    >
      {text}
    </span>
  );
}

/** The header's bottom rule: a plain divider, or the build's progress while one runs. */
export function BuildProgressRule({ build }: { build: TreeBuild | null }) {
  const busy = isBusy(build);
  const p = build?.progress;
  const value = !build
    ? null
    : build.phase === "indexing" && build.indexing
      ? build.indexing.done / Math.max(1, build.indexing.total)
      : p
        ? p.settled / Math.max(1, p.games)
        : null;
  return (
    <span aria-hidden="true" className="relative block h-px shrink-0 overflow-visible bg-line-soft">
      {busy &&
        (value === null ? (
          <span className="absolute inset-x-0 -top-px h-0.5 w-1/3 animate-pulse rounded-full bg-accent-400/70" />
        ) : (
          <span
            className="absolute left-0 -top-px h-0.5 rounded-full bg-accent-400 transition-all"
            style={{ width: `${Math.max(3, value * 100)}%` }}
          />
        ))}
    </span>
  );
}
