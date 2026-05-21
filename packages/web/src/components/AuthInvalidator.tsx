import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useCurrentUser } from "../hooks/useCurrentUser.ts";
import { queryPersister } from "../lib/query-persister";

export function AuthInvalidator() {
  const qc = useQueryClient();
  // Route through `useCurrentUser` so we never see an un-narrowed session
  // shape — the hook returns `null` when the session is missing or fails
  // schema validation, and the only thing we read here is the user id.
  const { user, isLoading } = useCurrentUser();
  const userId = user?.id ?? null;
  const lastUserId = useRef<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (!initialized.current) {
      lastUserId.current = userId;
      initialized.current = true;
      return;
    }
    if (lastUserId.current === userId) return;
    void qc.cancelQueries();
    qc.clear();
    // Also wipe the persisted snapshot so the previous user's data can't
    // hydrate on the next page load before AuthInvalidator has a chance to
    // run.
    void queryPersister?.removeClient();
    lastUserId.current = userId;
  }, [userId, isLoading, qc]);

  return null;
}
