import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { lazy, Suspense } from "react";
import {
  createBrowserRouter,
  createRoutesFromElements,
  Outlet,
  Route,
  RouterProvider,
} from "react-router-dom";
import { AuthGuard } from "./components/AuthGuard";
import { AuthInvalidator } from "./components/AuthInvalidator";
import Layout from "./components/Layout";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { queryClient } from "./lib/query-client";
import { queryPersistBuster, queryPersister } from "./lib/query-persister";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const OfflineDashboard = lazy(() => import("./pages/OfflineDashboard"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const PlayerProfilePage = lazy(() => import("./pages/PlayerProfilePage"));
const PlayersDirectoryPage = lazy(() => import("./pages/PlayersDirectoryPage"));
const DeckPreview = lazy(() => import("./pages/DeckPreview"));
const DndNightPreview = lazy(() => import("./pages/DndNightPreview"));
const DndToolPreview = lazy(() => import("./pages/DndToolPreview"));

// `GameMenu` is the dashboard's entry point into the games catalog.
// `GameShellLayout` mounts under `/play/:slug` and pulls in the games
// registry + the per-slug WebSocket session, so the deeper shell routes
// (mode select, lobby, tournament, …) hang off it. Lazy-loading both
// keeps the registry — including per-game accent.json / thumbnail urls /
// lazy component wrappers and the bundled BGG snapshot — out of the
// entry chunk, so dashboard / login / profile cold loads stay snappy.
const GameMenu = lazy(() => import("./components/GameMenu"));
const GameShellLayout = lazy(() =>
  import("./hooks/useGameShell").then((m) => ({ default: m.GameShellLayout })),
);
const ModeSelectRoute = lazy(() => import("./components/game-shell/ModeSelectRoute"));
const RulesRoute = lazy(() => import("./components/game-shell/RulesRoute"));
const JoinRoomRoute = lazy(() => import("./components/game-shell/JoinRoomRoute"));
const LobbyRoute = lazy(() => import("./components/game-shell/LobbyRoute"));
const MatchHistoryRoute = lazy(() => import("./components/game-shell/MatchHistoryRoute"));
const SoloGameRoute = lazy(() =>
  import("./components/game-shell/GameRoute").then((m) => ({ default: m.SoloGameRoute })),
);
const MpGameRoute = lazy(() =>
  import("./components/game-shell/GameRoute").then((m) => ({ default: m.MpGameRoute })),
);
const CompanionRoute = lazy(() =>
  import("./components/game-shell/GameRoute").then((m) => ({ default: m.CompanionRoute })),
);
const BgaRoute = lazy(() =>
  import("./components/game-shell/GameRoute").then((m) => ({ default: m.BgaRoute })),
);
const TournamentRoute = lazy(() =>
  import("./components/game-shell/TournamentRoutes").then((m) => ({ default: m.TournamentRoute })),
);
const TournamentMatchHistoryRoute = lazy(() =>
  import("./components/game-shell/TournamentRoutes").then((m) => ({
    default: m.TournamentMatchHistoryRoute,
  })),
);
const MatchHistoryReplayRoute = lazy(() =>
  import("./components/game-shell/ReplayRoutes").then((m) => ({
    default: m.MatchHistoryReplayRoute,
  })),
);
const TournamentReplayRoute = lazy(() =>
  import("./components/game-shell/ReplayRoutes").then((m) => ({
    default: m.TournamentReplayRoute,
  })),
);

/**
 * Root layout for the data router. Mounts AuthInvalidator and the
 * top-level error boundary so they wrap every child route. Lives
 * INSIDE `<RouterProvider>` so `<RouteErrorBoundary>` can read the
 * current pathname for its auto-reset key, and OUTSIDE `<Suspense>`
 * so lazy-import chunk-fetch failures fall through to the boundary
 * rather than to React's default white screen.
 */
function RootShell() {
  return (
    <>
      <AuthInvalidator />
      <RouteErrorBoundary>
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </RouteErrorBoundary>
    </>
  );
}

// Router is built once at module scope — the per-route `element` JSX
// captures the lazy components defined above, so the data router has a
// stable identity across re-renders of `<App>`. `createRoutesFromElements`
// keeps the structure declarative (same shape as the prior
// `<BrowserRouter><Routes>` tree); upgrading to the data router unlocks
// `useBlocker` for the room-leave guard plus future loader / action
// affordances without another structural migration.
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<RootShell />}>
      <Route
        path="/login"
        element={
          <AuthGuard mode="unauth">
            <LoginPage />
          </AuthGuard>
        }
      />

      {/* Public: reached via the one-time link an admin relays. The user is
          locked out, so no AuthGuard — better-auth validates the token. */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        index
        element={
          <AuthGuard mode="auth">
            <ProfilePage />
          </AuthGuard>
        }
      />

      <Route
        path="/admin"
        element={
          <AuthGuard mode="admin">
            <AdminPage />
          </AuthGuard>
        }
      />

      <Route
        path="/offline"
        element={
          <AuthGuard mode="auth">
            <OfflineDashboard />
          </AuthGuard>
        }
      />

      <Route
        path="/history"
        element={
          <AuthGuard mode="auth">
            <HistoryPage />
          </AuthGuard>
        }
      />

      <Route
        path="/players"
        element={
          <AuthGuard mode="offline">
            <PlayersDirectoryPage />
          </AuthGuard>
        }
      />

      <Route
        path="/u/:userId"
        element={
          <AuthGuard mode="offline">
            <PlayerProfilePage />
          </AuthGuard>
        }
      />

      {/* Online-gated branch: dashboard + per-game shell. The
          `<Layout>` element owns the page chrome (top nav, back
          button). Each `/play/:slug/*` sub-tree mounts a single
          `<GameShellLayout>` which owns the shared WebSocket and
          provides the `useGameShell()` context — every deeper
          route reads from there. */}
      <Route
        element={
          <AuthGuard mode="online">
            <Layout />
          </AuthGuard>
        }
      >
        <Route path="games" element={<GameMenu />} />
        <Route path="play/:slug" element={<GameShellLayout />}>
          <Route index element={<ModeSelectRoute />} />
          <Route path="rules" element={<RulesRoute />} />
          {/* `solo/*` so a game component can host internal sub-routes
              (the D&D tool's hall → setup → session screens). */}
          <Route path="solo/*" element={<SoloGameRoute />} />
          <Route path="companion" element={<CompanionRoute />} />
          <Route path="bga" element={<BgaRoute />} />
          <Route path="mp/join" element={<JoinRoomRoute />} />
          <Route path="mp/lobby/:roomCode" element={<LobbyRoute />} />
          <Route path="mp/play/:roomCode" element={<MpGameRoute />} />
          <Route path="match-history" element={<MatchHistoryRoute />} />
          <Route path="match-history/:replayId" element={<MatchHistoryReplayRoute />} />
          <Route path="tournament" element={<TournamentRoute />} />
          <Route
            path="tournament/:strategyA/:strategyB/:tournamentId"
            element={<TournamentMatchHistoryRoute />}
          />
          <Route
            path="tournament/:strategyA/:strategyB/:tournamentId/:gameIndex"
            element={<TournamentReplayRoute />}
          />
        </Route>
      </Route>

      <Route path="dev/deck-preview" element={<DeckPreview />} />
      <Route path="dev/dnd-preview" element={<DndNightPreview />} />
      <Route path="dev/dnd-tool-preview" element={<DndToolPreview />} />
    </Route>,
  ),
);

export default function App() {
  // Persist the entire query cache to localStorage so that locks, availability,
  // inventory, etc. hydrate from disk on first paint. Background refetch still
  // runs after hydration; UI only flashes if the data actually changed.
  if (!queryPersister) {
    return null;
  }
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 24 * 60 * 60 * 1000,
        buster: queryPersistBuster,
      }}
    >
      <RouterProvider router={router} />
      {import.meta.env.DEV && <ReactQueryDevtools buttonPosition="bottom-left" />}
    </PersistQueryClientProvider>
  );
}
