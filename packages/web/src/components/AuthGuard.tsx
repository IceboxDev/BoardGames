import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser.ts";
import { LoadingState } from "./ui/LoadingState";
import { PageShell } from "./ui/PageShell";

type Mode = "auth" | "unauth" | "online" | "offline" | "admin";

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
        <LoadingState />
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

  // Profiles are for offline players; online-only users are sent home.
  if (mode === "offline" && user.onlineMode === "online") {
    return <Navigate to="/" replace />;
  }

  if (mode === "admin" && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
