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
import type { BuildProgress } from "@boardgames/core/games/chess/trainer/builder";
import type { RepertoireTree, TreeSettings } from "@boardgames/core/games/chess/trainer/tree";
import type { Repertoire } from "@boardgames/core/protocol";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../../lib/api-fetch";
import { chessKeys, fetchAllGames, saveRepertoire } from "./api";
import type { FromWorker, PendingEval, ToWorker } from "./build.worker";
import { TrainerProviders } from "./engine-provider";
import { FarmEvals, type FarmState } from "./farm-evals";

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
}

export function useTreeBuild(rep: Repertoire, token: string | null): TreeBuild {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<BuildPhase>("idle");
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const [indexing, setIndexing] = useState<{ done: number; total: number } | null>(null);
  const [tree, setTree] = useState<RepertoireTree | null>(rep.tree);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<TrainerProviders | null>(null);
  const [farm, setFarm] = useState<FarmState | null>(null);
  const farmRef = useRef(new FarmEvals());
  const pendingRef = useRef<PendingEval[]>([]);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buildRef = useRef<(tree?: RepertoireTree | null) => void>(() => {});

  const workerRef = useRef<Worker | null>(null);
  const indexedRef = useRef<Promise<void> | null>(null);
  const versionRef = useRef(rep.version);
  const savingRef = useRef<Promise<void>>(Promise.resolve());
  const lastSaveRef = useRef(0);
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const settingsRef = useRef<TreeSettings>(rep.settings);
  settingsRef.current = rep.settings;

  useEffect(() => {
    if (!token) return;
    const p = new TrainerProviders(token);
    setProviders(p);
    return () => p.dispose();
  }, [token]);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      if (pollRef.current) clearTimeout(pollRef.current);
    },
    [],
  );

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
          const saved = await saveRepertoire(rep.id, {
            expectedVersion: versionRef.current,
            tree: next,
          });
          versionRef.current = saved.version;
          queryClient.setQueryData(chessKeys.repertoire(rep.id), saved);
          void queryClient.invalidateQueries({ queryKey: chessKeys.repertoires });
        } catch (err) {
          setError(
            err instanceof ApiError && err.status === 409
              ? "This tree was saved from another tab. Reload the page to continue here."
              : "Couldn't save the tree. It will be saved again at the next checkpoint.",
          );
        }
      });
    },
    [queryClient, rep.id],
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
    const p = (async () => {
      setPhase("loading");
      const games = await fetchAllGames(rep.color);
      const speeds = settingsRef.current.speeds;
      const chosen = speeds.length > 0 ? games.filter((g) => speeds.includes(g.speed)) : games;
      setPhase("indexing");
      await new Promise<void>((resolve) => {
        const onMessage = (e: MessageEvent<FromWorker>) => {
          if (e.data.type === "indexing") setIndexing({ done: e.data.done, total: e.data.total });
          if (e.data.type === "indexed") {
            w.removeEventListener("message", onMessage);
            resolve();
          }
        };
        w.addEventListener("message", onMessage);
        send(w, { type: "index", games: chosen });
      });
    })();
    indexedRef.current = p.catch((err) => {
      indexedRef.current = null;
      throw err;
    });
    return indexedRef.current;
  }, [ensureWorker, rep.color]);

  const build = useCallback(
    (from?: RepertoireTree | null) => {
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
          const parked = Object.values(previous.nodes)
            .filter((n) => n.status === "awaiting-eval")
            .map((n) => ({ fen: n.fen, kind: n.side, reach: n.following }));
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
              pendingRef.current = m.pending;
              if (m.pending.length > 0) void askFarm(m.tree);
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
          color: rep.color,
          settings: settingsRef.current,
          previous: previous ?? null,
          evals: farmRef.current.snapshot(),
        });
      })();
    },
    [askFarm, ensureIndexed, ensureWorker, providers, rep.color, save],
  );
  buildRef.current = build;

  const stop = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    const w = workerRef.current;
    if (!w) return;
    setPhase("stopping");
    send(w, { type: "stop" });
  }, []);

  return { phase, progress, indexing, tree, error, build, stop, providers, farm };
}
