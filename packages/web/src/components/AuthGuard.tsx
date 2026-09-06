import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser.ts";
import { RouteFallback } from "./RouteFallback";

export type AuthMode = "auth" | "unauth" | "online" | "offline" | "admin";

type Props = {
  mode: AuthMode;
  children: ReactNode;
};

// The session gate. Mounted once per auth mode as a layout route (see
// `AuthLayout` and App.tsx) so a page never wraps itself; the modes:
//
//   unauth   — must be signed OUT (login).
//   auth     — must be signed in.
//   online   — signed in AND may play online (onlineMode !== "offline").
//   offline  — signed in AND takes part in game nights (onlineMode !== "online").
//   admin    — signed in AND admin.
export function AuthGuard({ mode, children }: Props) {
  const { user, isLoading, isAdmin } = useCurrentUser();
  const location = useLocation();

  // The same screen the router shows while a lazy route resolves, so a cold
  // load reads as ONE wait rather than two differently-drawn ones.
  if (isLoading) return <RouteFallback />;

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
