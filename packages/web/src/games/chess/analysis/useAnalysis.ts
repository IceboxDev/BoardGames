import { toFen } from "@boardgames/core/games/chess/engine/fen";
import { replayGame } from "@boardgames/core/games/chess/game";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PositionEval } from "./grade";

/** Depth per position: ~0.1–0.3 s each in the lite engine. */
const DEPTH = 14;
const CACHE_PREFIX = "chess:analysis:v1:";

function cacheKey(startFen: string, ucis: readonly string[]): string {
  // FNV-1a over the game — short keys, and the same game always hits.
  let h = 0x811c9dc5;
  for (const ch of `${startFen}|${ucis.join(" ")}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return `${CACHE_PREFIX}${(h >>> 0).toString(36)}:${ucis.length}`;
}

function readCache(key: string): (PositionEval | undefined)[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as (PositionEval | undefined)[]) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, evals: readonly (PositionEval | undefined)[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(evals));
  } catch {
    // Storage full or blocked: the analysis just isn't remembered.
  }
}

export interface Analysis {
  /** `evals[i]` — the position after `i` moves; `undefined` while pending. */
  readonly evals: readonly (PositionEval | undefined)[];
  readonly running: boolean;
  /** 0–1. */
  readonly progress: number;
  readonly error: string | null;
  readonly start: () => void;
  /** Top lines for an arbitrary position (explore mode). */
  readonly explore: (fen: string) => Promise<PositionEval[]>;
}

/**
 * Engine analysis of a whole game, position by position, in a Web Worker.
 * Finished analyses are remembered per game in this browser.
 */
export function useAnalysis(startFen: string, ucis: readonly string[]): Analysis {
  const key = useMemo(() => cacheKey(startFen, ucis), [startFen, ucis]);
  const fens = useMemo(() => {
    try {
      return replayGame(
        startFen,
        ucis.map((uci) => ({ uci })),
      ).positions.map(toFen);
    } catch {
      return [];
    }
  }, [startFen, ucis]);

  const [evals, setEvals] = useState<(PositionEval | undefined)[]>(() => readCache(key) ?? []);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<import("./engine").BrowserEngine | null>(null);

  useEffect(() => () => engineRef.current?.terminate(), []);

  const engine = useCallback(async () => {
    if (!engineRef.current) {
      const { BrowserEngine } = await import("./engine");
      engineRef.current = new BrowserEngine();
    }
    return engineRef.current;
  }, []);

  const start = useCallback(() => {
    if (running || fens.length === 0) return;
    setRunning(true);
    setError(null);
    void (async () => {
      try {
        const sf = await engine();
        const out: (PositionEval | undefined)[] = [...evals];
        for (let i = 0; i < fens.length; i++) {
          if (out[i]) continue;
          const [top] = await sf.analyse(fens[i] ?? "", DEPTH);
          // A mated/stalemated final position has no lines: score it by the result.
          out[i] = top ?? { score: { cp: 0 }, best: null, pv: [], depth: 0 };
          setEvals([...out]);
        }
        writeCache(key, out);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Analysis failed");
      } finally {
        setRunning(false);
      }
    })();
  }, [running, fens, engine, evals, key]);

  const explore = useCallback(
    async (fen: string) => (await engine()).analyse(fen, DEPTH + 2, 3),
    [engine],
  );

  const done = evals.filter(Boolean).length;
  return {
    evals,
    running,
    progress: fens.length ? done / fens.length : 0,
    error,
    start,
    explore,
  };
}
