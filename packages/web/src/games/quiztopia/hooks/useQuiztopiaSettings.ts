import { DEFAULT_QUIZTOPIA_SETTINGS, type QuiztopiaSettings } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { qk } from "../../../lib/query-keys";
import { putSettings, settingsQuery } from "../api";

// The trainer's per-user settings: one GET, one PUT of the whole object.
// A save writes the reply straight into the cache and invalidates the two
// reads that depend on it (the overview's `newRemainingToday`, the queue's
// new-card cap), so the hub redraws without a manual refetch.

export function useQuiztopiaSettings() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.quiztopiaSettings(),
    queryFn: settingsQuery(),
    staleTime: 5 * 60_000,
  });
  const mutation = useMutation({
    mutationFn: putSettings,
    onSuccess: (data) => {
      qc.setQueryData(qk.quiztopiaSettings(), data);
      void qc.invalidateQueries({ queryKey: ["quiztopia", "overview"] });
      void qc.invalidateQueries({ queryKey: ["quiztopia", "queue"] });
    },
  });
  const settings: QuiztopiaSettings = query.data ?? DEFAULT_QUIZTOPIA_SETTINGS;
  const { mutate } = mutation;
  const save = useCallback(
    (patch: Partial<QuiztopiaSettings>) => mutate({ ...settings, ...patch }),
    [mutate, settings],
  );
  return {
    settings,
    /** False until the first GET resolves — callers seed from defaults meanwhile. */
    loaded: query.data !== undefined,
    query,
    save,
    saving: mutation.isPending,
    saveError: mutation.error,
  };
}
