/** Words for the build and the analysis farm (rail status line, settings dialog). */
import { lichessQueue } from "../lichess/client";
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

/** What a running build is waiting on, when it isn't just working: the farm or lichess. */
function waitText(build: TreeBuild, now: number): string | null {
  if (build.askingFarm) return "Fetching the farm's results";
  const lichess = lichessQueue();
  if (lichess.rateLimitedUntil !== null)
    return `lichess rate limit, retrying in ${Math.max(0, Math.ceil((lichess.rateLimitedUntil - now) / 1000))} s`;
  // lichess takes one explorer request every three seconds.
  if (lichess.waiting > 1) return `Asking lichess · ${lichess.waiting} waiting`;
  return null;
}

/** One line on where a tree's build stands (`now` for countdowns). */
export function buildLabel(build: TreeBuild, now = Date.now()): string {
  const p = build.progress;
  const tree = build.tree;
  switch (build.phase) {
    case "loading":
      return "Loading your games…";
    case "indexing":
      return `Indexing your games… ${build.indexing?.done.toLocaleString() ?? 0} / ${build.indexing?.total.toLocaleString() ?? "?"}`;
    case "stopping":
      return "Pausing…";
    case "building": {
      const base = p
        ? `Building · ${p.nodes.toLocaleString()} positions · ${p.settled.toLocaleString()} of ${p.games.toLocaleString()} games placed`
        : "Building…";
      // The wait first: the rail is narrow and the end of the line gets cut off.
      const wait = waitText(build, now);
      return wait ? `${wait} · ${base.replace(/^Building · /, "")}` : base;
    }
    default:
      // Nothing to say once a tree is built: the farm's progress is the map's
      // business (its chips), not a status line's.
      if (!tree) return "Not built yet.";
      if (tree.status === "generating") return "Paused part-way.";
      return "";
  }
}
