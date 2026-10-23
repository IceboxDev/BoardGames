/**
 * What the trainer's Home suggests, folder by folder. A folder is always
 * studied whole, so a folder has a state, never a count of moves to do:
 *
 *   due        a move of yours there is due: the folder comes back whole
 *   updated    you've studied it, and new moves of yours have landed in it
 *   new        nothing in it studied yet
 *   resting    studied, nothing due yet (it comes back on its own)
 *   analysing  nothing learnable yet; the farm is still working on it
 *   waiting    nothing learnable, and nothing on the farm (needs your move)
 *
 * The suggestions: due folders first (most overdue moves first), then the
 * folders to learn, ranked by how often you'll meet them. A folder the farm
 * may still add to goes after every finished one (`settled`): studying a
 * folder and then seeing it come back "updated" for one new line is what the
 * order avoids.
 */
import {
  analysedComplete,
  type Learning,
  learnable,
} from "@boardgames/core/games/chess/trainer/drill";
import type { TrainerFolder } from "@boardgames/core/games/chess/trainer/folders";
import { type Placed, splitName } from "./folder-tree";

export type FolderState = "due" | "updated" | "new" | "resting" | "analysing" | "waiting";

export interface HomeFolder {
  readonly placed: Placed;
  readonly l: Learning;
  /** Lichess games playing the folder's entering move, when known. */
  readonly games: number | null;
}

export function stateOf(l: Learning): FolderState {
  if (learnable(l) === 0) return l.pending > 0 ? "analysing" : "waiting";
  if (l.due > 0) return "due";
  const started = l.learnt + l.learning > 0;
  if (l.fresh > 0) return started ? "updated" : "new";
  return "resting";
}

/** Nothing more will be added here: every position analysed, extensions too. */
export const settled = (l: Learning): boolean => analysedComplete(l);

const weight = (f: HomeFolder) => f.games ?? learnable(f.l);

/** The folders worth studying now, best first (see the file's header). */
export function suggestions(folders: readonly HomeFolder[]): HomeFolder[] {
  const due = folders
    .filter((f) => stateOf(f.l) === "due")
    .sort((a, b) => b.l.due - a.l.due || weight(b) - weight(a));
  const learn = folders
    .filter((f) => {
      const s = stateOf(f.l);
      return s === "updated" || s === "new";
    })
    .sort(
      (a, b) =>
        Number(settled(b.l)) - Number(settled(a.l)) ||
        // A folder you've started comes before an untouched one of the same standing.
        Number(stateOf(b.l) === "updated") - Number(stateOf(a.l) === "updated") ||
        weight(b) - weight(a),
    );
  return [...due, ...learn];
}

/** "Main Line", "Exchange" and the like say nothing alone: they lead with the nearest named folder above. */
const GENERIC = new Set([
  "Main Line",
  "Normal",
  "Exchange",
  "Classical",
  "Retreat",
  "Advance",
  "Knight Line",
]);

export function displayName(p: Placed): string {
  const own = splitName(p.folder.name).label;
  if (!GENERIC.has(own)) return own;
  const up = [...p.parents]
    .reverse()
    .map((f) => splitName(f.name).label)
    .find((name) => !GENERIC.has(name));
  return up ? `${up} · ${own}` : own;
}

/** Where a folder sits, for telling same-named folders apart: its nearest named folder above. */
export function placeOf(p: Placed): string | null {
  const own = displayName(p);
  if (own.includes(" · ")) return null;
  const up = [...p.parents]
    .reverse()
    .map((f) => splitName(f.name).label)
    .find((name) => !GENERIC.has(name) && !own.startsWith(name));
  return up && p.parents.length > 1 ? up : null;
}

/** The moves into the folder, as the folder names spell them: "1.e4 › 1…e5 › 2.Nf3". */
export function lineOf(p: Placed): string {
  return [...p.parents, p.folder].map((f) => splitName(f.name).move).join(" › ");
}

/** Folders under one parent with at most this many deepest folders make one shelf. */
const SHELF_MAX = 30;

export interface Shelf {
  readonly id: string;
  readonly name: string;
  readonly folders: readonly HomeFolder[];
}

/**
 * The deepest folders gathered by opening: each goes under its highest folder
 * holding no more than `SHELF_MAX` of them (the Ruy Lopez, the Philidor, the
 * Caro-Kann), biggest shelves first. Folders that would sit alone gather in
 * one shelf of their own.
 */
export function shelves(folders: readonly HomeFolder[], otherName: string): Shelf[] {
  const count = new Map<TrainerFolder, number>();
  for (const f of folders)
    for (const up of f.placed.parents) count.set(up, (count.get(up) ?? 0) + 1);
  const groups = new Map<TrainerFolder | null, HomeFolder[]>();
  for (const f of folders) {
    // The highest folder small enough; of a chain holding the same folders
    // (2…Nc6 Normal › 3.Bb5 Ruy Lopez), the deepest named one.
    const ups = f.placed.parents;
    const first = ups.findIndex((up) => (count.get(up) ?? 0) <= SHELF_MAX);
    const same =
      first < 0
        ? []
        : ups.slice(first).filter((up) => count.get(up) === count.get(ups[first] as TrainerFolder));
    const home =
      same.filter((up) => !GENERIC.has(splitName(up.name).label)).at(-1) ?? same.at(-1) ?? null;
    const key = home && (count.get(home) ?? 0) > 1 ? home : null;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const size = (fs: readonly HomeFolder[]) => fs.reduce((t, f) => t + learnable(f.l), 0);
  const byWeight = (fs: readonly HomeFolder[]) => [...fs].sort((a, b) => weight(b) - weight(a));
  const named = [...groups.entries()]
    .flatMap(([home, fs]) =>
      home ? [{ id: home.id, name: splitName(home.name).label, folders: byWeight(fs) }] : [],
    )
    .sort((a, b) => size(b.folders) - size(a.folders));
  const rest = groups.get(null) ?? [];
  return rest.length > 0
    ? [...named, { id: "other", name: otherName, folders: byWeight(rest) }]
    : named;
}

// ── Back from the farm ───────────────────────────────────────────────

export interface QueuePlace {
  readonly status: "queued" | "running";
  /** Jobs the farm takes before it. */
  readonly ahead: number;
}

/**
 * Seconds until the farm has finished every one of `waiting` (the folder is
 * fully analysed), at the earliest: a running search ends in about half a job,
 * a queued one after its place in the line is worked through `lanes` at a
 * time, a job each. A position the farm holds no job for is left out (its
 * result is in, waiting for the next rebuild). Null when there is no rate to
 * go by (no lane running, no finished job yet) or nothing left to wait on.
 * The farm adds positions as it goes (a finished one queues what follows it),
 * so the real wait is longer.
 */
export function etaSeconds(
  waiting: readonly { fen: string }[],
  places: Readonly<Record<string, QueuePlace>>,
  lanes: number,
  avgSeconds: number | null,
): number | null {
  if (!avgSeconds || lanes === 0) return null;
  let worst: number | null = null;
  for (const w of waiting) {
    const place = places[w.fen];
    if (!place) continue;
    const t =
      place.status === "running"
        ? avgSeconds / 2
        : avgSeconds / 2 + (Math.floor(place.ahead / lanes) + 1) * avgSeconds;
    worst = worst === null ? t : Math.max(worst, t);
  }
  return worst;
}

/** "about 40 min", "about 3 h", "about 2 days". */
export function aboutTime(seconds: number): string {
  const h = seconds / 3600;
  if (h < 1) return `about ${Math.max(1, Math.round(h * 60))} min`;
  if (h < 36) return `about ${Math.round(h)} h`;
  return `about ${Math.round(h / 24)} days`;
}
