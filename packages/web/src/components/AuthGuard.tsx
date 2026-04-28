import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "../lib/auth-client";

type Mode = "auth" | "unauth" | "online" | "admin";

type Props = {
  mode: Mode;
  children: ReactNode;
};

export function AuthGuard({ mode, children }: Props) {
  const { data, isPending } = useSession();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-950">
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    );
  }

  const user = data?.user as { role?: string; onlineEnabled?: boolean } | undefined;

  if (mode === "unauth") {
    if (user) return <Navigate to="/" replace />;
    return <>{children}</>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (mode === "online" && !user.onlineEnabled) {
    return <Navigate to="/" replace />;
  }

  if (mode === "admin" && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
