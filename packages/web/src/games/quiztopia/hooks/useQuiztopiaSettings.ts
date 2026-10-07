import { DEFAULT_QUIZTOPIA_SETTINGS, type QuiztopiaSettings } from "@boardgames/core/protocol";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { qk } from "../../../lib/query-keys";
import { putSettings, settingsQuery } from "../api";
import { invalidateAfterSettings } from "../cache";

// The trainer's per-user settings: one GET, one PUT of the whole object.
//
// Saves are built so no change is ever lost or reverted:
//   - A change is applied to the cache AT ONCE (optimistic) and the PUT body
//     is that cache value — so a second tap builds on the first even while
//     the first is still in flight, instead of on a stale render.
//   - PUTs run one at a time in order (`scope`), so the server ends on the
//     last body sent, never on an older one that happened to land late.
//   - The server's reply is written back only by the LAST queued save (an
//     earlier reply would briefly undo a later optimistic change), and a
//     failure refetches the stored row so the screen shows the truth.
//   - Before the first GET resolves there is nothing to build on: `save`
//     refuses rather than PUT the defaults over the member's stored row.

const SAVE_KEY = ["quiztopia", "settings", "save"] as const;

export type SettingsChange =
  | Partial<QuiztopiaSettings>
  | ((current: QuiztopiaSettings) => Partial<QuiztopiaSettings>);

export function useQuiztopiaSettings() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.quiztopiaSettings(),
    queryFn: settingsQuery(),
    staleTime: 5 * 60_000,
  });

  // The mutation being settled still counts as pending inside its callbacks.
  const isLastSave = useCallback(() => qc.isMutating({ mutationKey: SAVE_KEY }) <= 1, [qc]);

  const mutation = useMutation({
    mutationKey: SAVE_KEY,
    scope: { id: "quiztopia-settings" },
    mutationFn: putSettings,
    onSuccess: (data) => {
      if (isLastSave()) qc.setQueryData(qk.quiztopiaSettings(), data);
    },
    onError: () => {
      if (isLastSave()) void qc.invalidateQueries({ queryKey: qk.quiztopiaSettings() });
    },
    onSettled: () => {
      if (isLastSave()) void invalidateAfterSettings(qc);
    },
  });
  const pendingSaves = useIsMutating({ mutationKey: SAVE_KEY });

  const { mutate } = mutation;
  /**
   * Apply a change and save it. A function change reads the LATEST settings
   * (including saves still in flight). Returns false — and does nothing —
   * until the stored settings have loaded.
   */
  const save = useCallback(
    (change: SettingsChange): boolean => {
      const current = qc.getQueryData<QuiztopiaSettings>(qk.quiztopiaSettings());
      if (!current) return false;
      const next = { ...current, ...(typeof change === "function" ? change(current) : change) };
      // A refetch landing after this would paint the pre-change row.
      void qc.cancelQueries({ queryKey: qk.quiztopiaSettings() });
      qc.setQueryData(qk.quiztopiaSettings(), next);
      mutate(next);
      return true;
    },
    [qc, mutate],
  );

  const settings: QuiztopiaSettings = query.data ?? DEFAULT_QUIZTOPIA_SETTINGS;
  return {
    settings,
    /** False until the first GET resolves — callers seed from defaults meanwhile. */
    loaded: query.data !== undefined,
    query,
    save,
    saving: pendingSaves > 0,
    saveError: mutation.error,
  };
}
