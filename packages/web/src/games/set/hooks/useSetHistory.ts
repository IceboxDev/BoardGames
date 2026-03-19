import type { GameRecord } from "@boardgames/core/games/set/types";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearHistory,
  clearServerHistory,
  fetchServerHistory,
  findUnsyncedRecords,
  loadGameHistory,
  mergeHistories,
  postBulkRecordsToServer,
  postGameRecordToServer,
  saveFullHistory,
  saveGameRecord,
} from "../logic/persistence";

export interface UseSetHistoryReturn {
  history: GameRecord[];
  loading: boolean;
  save: (record: GameRecord) => void;
  clear: () => void;
}

export function useSetHistory(): UseSetHistoryReturn {
  const [history, setHistory] = useState<GameRecord[]>(() => loadGameHistory());
  const [loading, setLoading] = useState(true);
  const savedIds = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const local = loadGameHistory();
      const remote = await fetchServerHistory();

      if (cancelled) return;

      const merged = mergeHistories(local, remote);
      setHistory(merged);
      saveFullHistory(merged);
      setLoading(false);

      const unsynced = findUnsyncedRecords(local, remote);
      if (unsynced.length > 0) {
        await postBulkRecordsToServer(unsynced);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback((record: GameRecord) => {
    if (savedIds.current.has(record.id)) return;
    savedIds.current.add(record.id);

    saveGameRecord(record);
    setHistory((prev) => [...prev, record]);
    postGameRecordToServer(record);
  }, []);

  const clear = useCallback(() => {
    clearHistory();
    clearServerHistory();
    setHistory([]);
    savedIds.current.clear();
  }, []);

  return { history, loading, save, clear };
}
