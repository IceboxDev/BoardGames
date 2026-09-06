import { Outlet } from "react-router-dom";
import { AuthGuard, type AuthMode } from "./AuthGuard";

// ── AuthLayout ───────────────────────────────────────────────────────────
//
// A pathless layout route that gates every child route on one auth mode:
//
//   <Route element={<AuthLayout mode="offline" />}>
//     <Route path="/players" lazy={…} />
//     <Route path="/u/:userId" lazy={…} />
//   </Route>
//
// Before this existed App.tsx wrapped all thirteen page elements in their
// own `<AuthGuard mode=…>`, so the guard's mode was repeated per route and a
// new page could forget it. Grouping routes under one layout makes the mode a
// property of the tree, checked once, and lets the guard's loading screen
// sit exactly where the page will.

export function AuthLayout({ mode }: { mode: AuthMode }) {
  return (
    <AuthGuard mode={mode}>
      <Outlet />
    </AuthGuard>
  );
}
