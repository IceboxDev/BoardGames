import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useSession } from "../lib/auth-client";

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
    lastUserId.current = userId;
  }, [userId, isPending, qc]);

  return null;
}
