/**
 * Pulling the linked account's games from lichess into our server: every
 * game after the newest one stored, streamed from lichess and uploaded in
 * batches. Stopping (or closing the tab) loses nothing — the next pull starts
 * after the newest game the server has.
 */

import type { SkipReason } from "@boardgames/core/games/chess/trainer/imported-game";
import type { LichessLink } from "@boardgames/core/protocol";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { chessKeys, uploadGames } from "./api";
import {
  type ExportProgress,
  exportGames,
  LichessAuthError,
  lichessGameCount,
} from "./lichess/client";
import { forgetLichessToken } from "./lichess/oauth";

const BATCH = 500;

export interface ImportState {
  readonly running: boolean;
  readonly progress: ExportProgress | null;
  /** New games stored by this pull. */
  readonly stored: number;
  /** The account's game count on lichess (all variants), when known. */
  readonly total: number | null;
  /** Games already stored when this pull began. */
  readonly storedBefore: number;
  /** The last pull read everything lichess had (not stopped, no error). */
  readonly finished: boolean;
  readonly error: string | null;
  readonly start: (link: LichessLink) => void;
  readonly stop: () => void;
}

export function useLichessImport(token: string | null, onAuthLost: () => void): ImportState {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [stored, setStored] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [storedBefore, setStoredBefore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    (link: LichessLink) => {
      if (!token || abortRef.current) return;
      const abort = new AbortController();
      abortRef.current = abort;
      setRunning(true);
      setError(null);
      setStored(0);
      setStoredBefore(link.gamesCount);
      setFinished(false);
      setProgress(null);
      void (async () => {
        try {
          setTotal(await lichessGameCount(link.username, token).catch(() => null));
          // lichess may end a long export early; keep asking from the newest
          // game read until a pass brings nothing new.
          let since = (link.newestGameAt ?? -1) + 1;
          const before = { seen: 0, kept: 0, skipped: {} as ExportProgress["skipped"] };
          for (;;) {
            const base = { ...before };
            const pass = await exportGames({
              username: link.username,
              lichessId: link.lichessId,
              token,
              since,
              batchSize: BATCH,
              signal: abort.signal,
              onProgress: (p) => {
                const skipped = { ...base.skipped };
                for (const [k, n] of Object.entries(p.skipped) as [SkipReason, number][]) {
                  skipped[k] = (skipped[k] ?? 0) + n;
                }
                const merged = { seen: base.seen + p.seen, kept: base.kept + p.kept, skipped };
                Object.assign(before, merged);
                setProgress(merged);
              },
              onBatch: async (games) => {
                const r = await uploadGames(games);
                setStored((n) => n + r.stored);
                queryClient.setQueryData(chessKeys.link, { link: r.link });
              },
            });
            if (pass.seen === 0 || pass.lastCreatedAt === null) break;
            since = pass.lastCreatedAt + 1;
          }
          setFinished(true);
        } catch (err) {
          if (abort.signal.aborted) return;
          if (err instanceof LichessAuthError) {
            forgetLichessToken();
            onAuthLost();
          }
          setError(err instanceof Error ? err.message : "The import stopped.");
        } finally {
          abortRef.current = null;
          setRunning(false);
          void queryClient.invalidateQueries({ queryKey: chessKeys.link });
        }
      })();
    },
    [onAuthLost, queryClient, token],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { running, progress, stored, total, storedBefore, finished, error, start, stop };
}
