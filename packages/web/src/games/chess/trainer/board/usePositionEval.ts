/**
 * The evaluation of the shown position, one source for the eval bar and the
 * explorer: the tree's own (the analysis farm's deep search, or whatever the
 * build used) when the position is in it, else lichess's cloud, else a quick
 * search in this browser.
 *
 * Every lookup is kept in this browser (`eval-cache.ts`): a position seen once
 * shows at once, reloads included. The positions one move ahead (`prefetch`:
 * the next move of the line, the tree's replies) are fetched from lichess's
 * cloud in the background, so the next step is usually ready before you take it.
 */
import type { TreeNode } from "@boardgames/core/games/chess/trainer/tree";
import { useEffect, useState } from "react";
import type { QuickEval, TrainerProviders } from "../engine-provider";
import { cachedEval, storedEval, storeEval } from "./eval-cache";

/** Depth for the in-browser fallback. */
const QUICK_DEPTH = 20;
/** A short pause before a NEW lookup, so racing through a line doesn't queue one per move. */
const LOOKUP_DELAY_MS = 120;

const TREE_SOURCE: Record<string, string> = {
  farm: "analysis farm",
  "lichess-cloud": "lichess cloud",
  "lichess-dump": "lichess cloud",
  chessdb: "ChessDB",
};

export interface PositionEval extends QuickEval {
  /** The deepest line's depth. */
  readonly depth: number;
}

export function usePositionEval(
  fen: string,
  node: TreeNode | null,
  providers: TrainerProviders | null,
  prefetch: readonly string[] = [],
): { eval: PositionEval | null; loading: boolean } {
  const treeLines = node?.engine && node.engine.length > 0 ? node.engine : null;
  const [found, setFound] = useState<{ fen: string; value: QuickEval } | null>(null);

  useEffect(() => {
    if (treeLines) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void (async () => {
      const kept = await storedEval(fen);
      if (!live) return;
      if (kept) {
        setFound({ fen, value: kept });
        return;
      }
      if (!providers) return;
      timer = setTimeout(() => {
        providers
          .quickLines(fen, QUICK_DEPTH)
          .then((value) => {
            void storeEval(fen, value);
            if (live) setFound({ fen, value });
          })
          .catch(() => {});
      }, LOOKUP_DELAY_MS);
    })();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [fen, treeLines, providers]);

  // One move ahead, quietly: lichess cloud only (the browser engine is kept
  // for the position you're actually on).
  const ahead = prefetch.join("|");
  useEffect(() => {
    if (!providers || !ahead) return;
    let live = true;
    const t = setTimeout(async () => {
      for (const next of ahead.split("|")) {
        if (!live) return;
        if (await storedEval(next)) continue;
        const cloud = await providers.cloudLines(next).catch(() => null);
        if (cloud) void storeEval(next, cloud);
      }
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [ahead, providers]);

  const quick = found?.fen === fen ? found.value : cachedEval(fen);
  const value: QuickEval | null = treeLines
    ? {
        lines: treeLines,
        source:
          TREE_SOURCE[node?.evalSource ?? ""] ??
          (node?.evalSpec ? "analysis farm" : "quick search"),
      }
    : quick;
  return {
    eval: value ? { ...value, depth: Math.max(0, ...value.lines.map((l) => l.depth)) } : null,
    loading: !value && !!providers,
  };
}
