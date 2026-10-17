/** Words for the build and the analysis farm (rail status line, settings dialog). */
import type { TreeBuild } from "../useTreeBuild";

/** The farm's progress on this tree, with a rough time left. */
export function farmText(farm: TreeBuild["farm"]): string | null {
  if (!farm) return null;
  const ahead = farm.queued + farm.running;
  const alive = farm.lastSeen !== null && Date.now() - Date.parse(farm.lastSeen) < 10 * 60_000;
  const eta =
    farm.avgSeconds !== null && ahead > 0
      ? ` About ${formatHours((ahead * farm.avgSeconds) / 3600)} for the whole queue.`
      : "";
  return alive
    ? `Working: ${farm.waiting.toLocaleString()} of this tree's positions waiting, ${ahead.toLocaleString()} in the queue.${eta}`
    : `${farm.waiting.toLocaleString()} positions queued; the farm is offline right now.`;
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return `${(h / 24).toFixed(1)} days`;
}

/** One line on where a tree's build stands. */
export function buildLabel(build: TreeBuild): string {
  const p = build.progress;
  const tree = build.tree;
  switch (build.phase) {
    case "loading":
      return "Loading your games…";
    case "indexing":
      return `Indexing your games… ${build.indexing?.done.toLocaleString() ?? 0} / ${build.indexing?.total.toLocaleString() ?? "?"}`;
    case "stopping":
      return "Pausing…";
    case "building":
      return p
        ? `Building · ${p.nodes.toLocaleString()} positions · ${p.settled.toLocaleString()} of ${p.games.toLocaleString()} games placed`
        : "Building…";
    default:
      if (!tree) return "Not built yet.";
      if (tree.status === "analysing") return "Built; waiting for the analysis farm.";
      if (tree.status === "generating") return "Paused part-way.";
      return `Built · ${Object.keys(tree.nodes).length.toLocaleString()} positions`;
  }
}
