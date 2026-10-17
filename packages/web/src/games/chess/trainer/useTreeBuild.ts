/**
 * Running a tree build for one repertoire: load your games as its colour,
 * index them in the build worker, then build — answering the worker's engine
 * and explorer questions here — and save the tree as it grows (every half a
 * minute, and when the build stops or finishes).
 *
 * With a deep spec (`settings.evalSpec`) the build runs in waves: each pass
 * parks the positions the analysis farm hasn't evaluated, they are requested
 * from the server, and the next pass starts as soon as results arrive
 * (checked every two minutes while the farm works).
 */

import { parseFen, positionKey } from "@boardgames/core/games/chess/engine/fen";
import type { BuildProgress } from "@boardgames/core/games/chess/trainer/builder";
import { FARM_FOCUS } from "@boardgames/core/games/chess/trainer/folders";
import type { MoveStat } from "@boardgames/core/games/chess/trainer/position-index";
import {
  type RepertoireTree,
  type TreeSettings,
  TreeSettingsSchema,
} from "@boardgames/core/games/chess/trainer/tree";
import { type Repertoire, RepertoireSchema } from "@boardgames/core/protocol";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiFetch } from "../../../lib/api-fetch";
import { chessKeys, fetchAllGames, saveRepertoire } from "./api";
import { walkLine } from "./board/model";
import type { FromWorker, PendingEval, ToWorker } from "./build.worker";
import { TrainerProviders } from "./engine-provider";
import { FarmEvals, type FarmState } from "./farm-evals";
import { reachableFrom } from "./tree-nav";

/** The tree positions in the farm's focus folders for this colour. */
function focusKeys(tree: RepertoireTree, color: "w" | "b"): Set<string> {
  const roots = FARM_FOCUS[color].map((moves) => walkLine(moves).at(-1)?.key ?? "");
  return reachableFrom(tree, roots);
}

const SAVE_EVERY_MS = 30_000;
const FARM_POLL_MS = 2 * 60_000;

const send = (w: Worker, m: ToWorker) => w.postMessage(m);

export type BuildPhase = "idle" | "loading" | "indexing" | "building" | "stopping";

export interface TreeBuild {
  readonly phase: BuildPhase;
  readonly progress: BuildProgress | null;
  readonly indexing: { done: number; total: number } | null;
  readonly tree: RepertoireTree | null;
  readonly error: string | null;
  /** Build (or rebuild from) `tree` — the current one when omitted. */
  readonly build: (tree?: RepertoireTree | null) => void;
  readonly stop: () => void;
  /** The engine/explorer the build uses, for the decision panel's suggestions. */
  readonly providers: TrainerProviders | null;
  /** The analysis farm's queue, while this tree waits for it. */
  readonly farm: FarmState | null;
  /** What your games (as this colour) played from a position, most first. */
  readonly positionStats: (fen: string) => Promise<MoveStat[]>;
  /** Folder ownership of your games (see the worker's `folders` message). */
  readonly folderCounts: (
    folders: readonly { fen: string; moves: readonly string[] }[],
  ) => Promise<{ owned: number[]; transposed: number[] }>;
  /** Your games at a position, and how many came by another move order than `moves`. */
  readonly transposition: (
    fen: string,
    moves: readonly string[],
  ) => Promise<{ games: number; transposed: number }>;
}

/**
 * `gamesKey` names the imported games (count and newest): the index this
 * browser keeps is reused while it's unchanged, rebuilt after a pull.
 */
export function useTreeBuild(
  rep: Repertoire | null,
  token: string | null,
  gamesKey: string,
  /** The colour, known before the tree itself has loaded. */
  color: "w" | "b",
): TreeBuild {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<BuildPhase>("idle");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const [indexing, setIndexing] = useState<{ done: number; total: number } | null>(null);
  const [tree, setTree] = useState<RepertoireTree | null>(rep?.tree ?? null);
  const [error, setError] = useState<string | null>(null);
  // Made with the token, in the same render: a build started the moment the
  // token appears must find them (an effect would set them a render late).
  const providers = useMemo(() => (token ? new TrainerProviders(token) : null), [token]);
  const [farm, setFarm] = useState<FarmState | null>(null);
  const farmRef = useRef(new FarmEvals());
  /** Deviation leaves' answers, kept apart from the build's own farm results. */
  const pendingRef = useRef<PendingEval[]>([]);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buildRef = useRef<(tree?: RepertoireTree | null) => void>(() => {});

  const workerRef = useRef<Worker | null>(null);
  const indexedRef = useRef<Promise<void> | null>(null);
  const versionRef = useRef(rep?.version ?? 1);
  const savingRef = useRef<Promise<void>>(Promise.resolve());
  const lastSaveRef = useRef(0);
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const settingsRef = useRef<TreeSettings>(rep?.settings ?? TreeSettingsSchema.parse({}));
  if (rep) settingsRef.current = rep.settings;
  // The tree arriving after the screen opened (the hook outlives "loading").
  const repRef = useRef(rep);
  repRef.current = rep;
  // Take in the stored tree the moment it arrives — during this render, not
  // in an effect: a build started by the screen's own effects (which run
  // before this hook's) must build on it, never from nothing over it.
  const loadedRef = useRef<string | null>(rep ? rep.id : null);
  if (rep && loadedRef.current !== rep.id) {
    loadedRef.current = rep.id;
    versionRef.current = rep.version;
    treeRef.current = rep.tree;
    setTree(rep.tree);
  }

  useEffect(() => () => providers?.dispose(), [providers]);

  // Close the worker when the page really goes away — not on React's dev-mode
  // unmount-and-remount, which would kill a worker an index or build already
  // waits on (it is created on first use, possibly before that remount).
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      setTimeout(() => {
        if (mountedRef.current) return;
        workerRef.current?.terminate();
        workerRef.current = null;
        indexedRef.current = null;
        if (pollRef.current) clearTimeout(pollRef.current);
      }, 0);
    };
  }, []);

  /** Ask the server for the parked positions; rebuild at once if any came back. */
  const askFarm = useCallback(async (from: RepertoireTree) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    try {
      const { added, farm: state } = await farmRef.current.request(pendingRef.current);
      setFarm(state);
      if (added > 0) {
        buildRef.current(from);
        return;
      }
    } catch {
      setError("Couldn't reach the server for the farm's results. Trying again shortly.");
    }
    pollRef.current = setTimeout(() => void askFarm(treeRef.current ?? from), FARM_POLL_MS);
  }, []);

  const save = useCallback(
    (next: RepertoireTree) => {
      lastSaveRef.current = Date.now();
      savingRef.current = savingRef.current.then(async () => {
        try {
          const id = repRef.current?.id;
          if (!id) return;
          const saved = await saveRepertoire(id, {
            expectedVersion: versionRef.current,
            tree: next,
          });
          versionRef.current = saved.version;
          queryClient.setQueryData(chessKeys.repertoire(id), saved);
          void queryClient.invalidateQueries({ queryKey: chessKeys.repertoires });
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            // Saved elsewhere since (another tab, another machine): take the
            // newer tree and carry on from it — the cached positions make a
            // rebuild cheap, and nothing chosen there is overwritten.
            const id = repRef.current?.id;
            if (!id) return;
            try {
              const fresh = await apiFetch(
                `/api/trainers/chess/repertoires/${encodeURIComponent(id)}`,
                {
                  response: RepertoireSchema,
                },
              );
              versionRef.current = fresh.version;
              treeRef.current = fresh.tree;
              setTree(fresh.tree);
              queryClient.setQueryData(chessKeys.repertoire(id), fresh);
              setError(null);
              if (phaseRef.current === "idle") buildRef.current(fresh.tree);
            } catch {
              setError(
                "Couldn't reach the server to save the tree. It will be saved again shortly.",
              );
            }
            return;
          }
          setError("Couldn't save the tree. It will be saved again at the next checkpoint.");
        }
      });
    },
    [queryClient],
  );

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;
    const w = new Worker(new URL("./build.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    return w;
  }, []);

  const ensureIndexed = useCallback((): Promise<void> => {
    if (indexedRef.current) return indexedRef.current;
    const w = ensureWorker();
    const speeds = settingsRef.current.speeds;
    const key = `v1:${color}:${gamesKey}:${[...speeds].sort().join(",")}`;
    // A worker that answers "failed" (or a worker from before a code update
    // that doesn't know the message) must not leave the screen loading forever.
    const ask = <T extends FromWorker["type"]>(m: ToWorker, until: T, timeoutMs: number) =>
      new Promise<Extract<FromWorker, { type: T }>>((resolve, reject) => {
        const timer = setTimeout(() => {
          w.removeEventListener("message", onMessage);
          reject(new Error(`no ${until} from the build worker`));
        }, timeoutMs);
        const onMessage = (e: MessageEvent<FromWorker>) => {
          if (e.data.type === "indexing") setIndexing({ done: e.data.done, total: e.data.total });
          if (e.data.type === until || e.data.type === "failed") {
            clearTimeout(timer);
            w.removeEventListener("message", onMessage);
            if (e.data.type === "failed") reject(new Error(e.data.message));
            else resolve(e.data as Extract<FromWorker, { type: T }>);
          }
        };
        w.addEventListener("message", onMessage);
        send(w, m);
      });
    const p = (async () => {
      setPhase("loading");
      // The index this browser kept from an earlier visit, while no games changed.
      const kept = await ask({ type: "load", key }, "loaded", 10_000).catch(() => ({ hit: false }));
      if (!kept.hit) {
        const games = await fetchAllGames(color);
        const chosen = speeds.length > 0 ? games.filter((g) => speeds.includes(g.speed)) : games;
        setPhase("indexing");
        setIndexing({ done: 0, total: chosen.length });
        await ask({ type: "index", key, games: chosen }, "indexed", 5 * 60_000);
      }
      // Indexed for the explorer alone: no build follows, so the status goes back to idle.
      setPhase((ph) => (ph === "indexing" || ph === "loading" ? "idle" : ph));
    })();
    indexedRef.current = p.catch((err) => {
      indexedRef.current = null;
      setPhase((ph) => (ph === "loading" || ph === "indexing" ? "idle" : ph));
      throw err;
    });
    return indexedRef.current;
  }, [ensureWorker, color, gamesKey]);

  // New games (a pull): the next build indexes again.
  const lastGamesKey = useRef(gamesKey);
  useEffect(() => {
    if (lastGamesKey.current === gamesKey) return;
    lastGamesKey.current = gamesKey;
    indexedRef.current = null;
  }, [gamesKey]);

  const build = useCallback(
    (from?: RepertoireTree | null) => {
      if (!repRef.current) return;
      if (!providers) {
        setError("Connect lichess in this browser to build trees.");
        return;
      }
      setError(null);
      if (pollRef.current) clearTimeout(pollRef.current);
      const previous = from === undefined ? treeRef.current : from;
      void (async () => {
        try {
          await ensureIndexed();
        } catch {
          setPhase("idle");
          setError("Couldn't load your games.");
          return;
        }
        // Positions an earlier pass parked: fetch whatever the farm has finished.
        if (settingsRef.current.evalSpec && previous) {
          const focus = focusKeys(previous, color);
          const parked = Object.entries(previous.nodes)
            .filter(([key, n]) => n.status === "awaiting-eval" && focus.has(key))
            .map(([, n]) => n)
            .map((n) => ({
              fen: n.fen,
              kind: n.side,
              reach: n.following,
              stage: n.extension ?? 0,
            }));
          if (parked.length > 0) {
            await farmRef.current
              .request(parked)
              .then((r) => setFarm(r.farm))
              .catch(() => {});
          }
        }
        const w = ensureWorker();
        setPhase("building");
        const onMessage = async (e: MessageEvent<FromWorker>) => {
          const m = e.data;
          if (m.type === "ask-engine" || m.type === "ask-popular") {
            try {
              if (m.type === "ask-engine") {
                const lines = await providers.engineLines(m.fen, m.multipv, m.depth);
                send(w, { type: "answer", id: m.id, lines });
              } else {
                send(w, { type: "answer", id: m.id, popular: await providers.popularMoves(m.fen) });
              }
            } catch (err) {
              send(w, {
                type: "answer",
                id: m.id,
                error: err instanceof Error ? err.message : "lookup failed",
              });
            }
            return;
          }
          if (m.type === "progress") setProgress(m.progress);
          if (m.type === "checkpoint") {
            setTree(m.tree);
            if (Date.now() - lastSaveRef.current > SAVE_EVERY_MS) save(m.tree);
          }
          if (m.type === "done" || m.type === "failed") {
            w.removeEventListener("message", onMessage);
            setPhase("idle");
            if (m.type === "done") {
              setTree(m.tree);
              save(m.tree);
              // The farm works on the focus folders only (`FARM_FOCUS`):
              // positions elsewhere wait, unasked.
              const focus = focusKeys(m.tree, color);
              const inFocus = (fen: string) => focus.has(positionKey(parseFen(fen)));
              pendingRef.current = m.pending.filter((p) => inFocus(p.fen));
              if (pendingRef.current.length > 0) void askFarm(m.tree);
              else setFarm(null);
            } else {
              setError(`The build stopped: ${m.message}`);
              if (treeRef.current) save(treeRef.current);
            }
          }
        };
        w.addEventListener("message", onMessage);
        send(w, {
          type: "build",
          color,
          settings: settingsRef.current,
          previous: previous ?? null,
          evals: farmRef.current.snapshot(),
        });
      })();
    },
    [askFarm, ensureIndexed, ensureWorker, providers, color, save],
  );
  buildRef.current = build;

  const statsId = useRef(1);
  const positionStats = useCallback(
    async (fen: string): Promise<MoveStat[]> => {
      await ensureIndexed();
      const w = ensureWorker();
      const id = statsId.current++;
      return new Promise((resolve) => {
        const onMessage = (e: MessageEvent<FromWorker>) => {
          if (e.data.type !== "stats" || e.data.id !== id) return;
          w.removeEventListener("message", onMessage);
          resolve(e.data.moves);
        };
        w.addEventListener("message", onMessage);
        send(w, { type: "stats", id, fen });
      });
    },
    [ensureIndexed, ensureWorker],
  );

  /** One question to the worker, answered by message `type` with this id. */
  const askWorker = useCallback(
    async <T extends FromWorker["type"]>(
      message: (id: number) => ToWorker,
      type: T,
    ): Promise<Extract<FromWorker, { type: T }>> => {
      await ensureIndexed();
      const w = ensureWorker();
      const id = statsId.current++;
      return new Promise((resolve) => {
        const onMessage = (e: MessageEvent<FromWorker>) => {
          const d = e.data;
          if (d.type !== type || !("id" in d) || d.id !== id) return;
          w.removeEventListener("message", onMessage);
          resolve(d as Extract<FromWorker, { type: T }>);
        };
        w.addEventListener("message", onMessage);
        send(w, message(id));
      });
    },
    [ensureIndexed, ensureWorker],
  );

  const folderCounts = useCallback(
    async (folders: readonly { fen: string; moves: readonly string[] }[]) => {
      const r = await askWorker(
        (id) => ({
          type: "folders",
          id,
          folders: folders.map((f) => ({ fen: f.fen, moves: [...f.moves] })),
        }),
        "folders",
      );
      return { owned: r.owned, transposed: r.transposed };
    },
    [askWorker],
  );

  const transposition = useCallback(
    async (fen: string, moves: readonly string[]) => {
      const r = await askWorker(
        (id) => ({ type: "transposed", id, fen, moves: [...moves] }),
        "transposed",
      );
      return { games: r.games, transposed: r.transposed };
    },
    [askWorker],
  );

  const stop = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    const w = workerRef.current;
    if (!w) return;
    setPhase("stopping");
    send(w, { type: "stop" });
  }, []);

  return {
    phase,
    progress,
    indexing,
    tree,
    error,
    build,
    stop,
    providers,
    farm,
    positionStats,
    folderCounts,
    transposition,
  };
}
