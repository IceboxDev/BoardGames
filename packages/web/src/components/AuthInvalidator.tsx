import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useSession } from "../lib/auth-client";
import { queryPersister } from "../lib/query-persister";

export function AuthInvalidator() {
  const qc = useQueryClient();
  const { data, isPending } = useSession();
  const userId = data?.user?.id ?? null;
  const lastUserId = useRef<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (isPending) return;
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
  }, [userId, isPending, qc]);

  return null;
}
