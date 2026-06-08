import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser.ts";
import { PageShell } from "./ui/PageShell";

type Mode = "auth" | "unauth" | "online" | "admin";

type Props = {
  mode: Mode;
  children: ReactNode;
};

export function AuthGuard({ mode, children }: Props) {
  const { user, isLoading, isAdmin } = useCurrentUser();
  const location = useLocation();

  if (isLoading) {
    return (
      <PageShell layout="centered" background="plain">
        <span className="text-sm text-fg-muted">Loading…</span>
      </PageShell>
    );
  }

  if (mode === "unauth") {
    if (user) return <Navigate to="/" replace />;
    return <>{children}</>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (mode === "online" && user.onlineMode === "offline") {
    return <Navigate to="/" replace />;
  }

  if (mode === "admin" && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
