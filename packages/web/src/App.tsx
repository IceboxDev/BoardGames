import { defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type ComponentType, Suspense } from "react";
import {
  createBrowserRouter,
  createRoutesFromElements,
  Outlet,
  Route,
  RouterProvider,
} from "react-router-dom";
import { AuthInvalidator } from "./components/AuthInvalidator";
import { AuthLayout } from "./components/AuthLayout";
import { GreetingGate } from "./components/GreetingGate";
import Layout from "./components/Layout";
import { NavigationProgress } from "./components/NavigationProgress";
import { PageViewTracker } from "./components/PageViewTracker";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { RouteFallback } from "./components/RouteFallback";
import { queryClient } from "./lib/query-client";
import { queryPersistBuster, queryPersister } from "./lib/query-persister";
import { ThemeProvider } from "./lib/theme/provider";

// ── Route modules ────────────────────────────────────────────────────────
//
// Every screen is a ROUTE-LEVEL lazy module (`<Route lazy>`), not a
// `React.lazy` element. The difference is who waits: with `React.lazy` the
// router commits the navigation immediately and the page's Suspense boundary
// renders `null` while the chunk downloads — a blank screen on every cold
// route. With route `lazy`, the data router resolves the module BEFORE
// committing, keeps the current page on screen meanwhile, and exposes the
// wait as `useNavigation().state` (drawn by <NavigationProgress>). The very
// first load, where there is no current page, renders `hydrateFallbackElement`.
//
// `page()` adapts a default-export page module; `named()` a named export.

type PageModule = { default: ComponentType };

function page(load: () => Promise<PageModule>) {
  return async () => ({ Component: (await load()).default });
}

function named<K extends string>(load: () => Promise<Record<K, ComponentType>>, key: K) {
  return async () => ({ Component: (await load())[key] });
}

/**
 * Root layout for the data router. Mounts AuthInvalidator and the
 * top-level error boundary so they wrap every child route. Lives
 * INSIDE `<RouterProvider>` so `<RouteErrorBoundary>` can read the
 * current pathname for its auto-reset key, and OUTSIDE `<Suspense>`
 * so a chunk-fetch failure falls through to the boundary rather than
 * to React's default white screen. The Suspense is a safety net for
 * anything that still uses `React.lazy` below a route (game boards,
 * the greeting host); it draws the same fallback as the router.
 */
function RootShell() {
  return (
    <ThemeProvider>
      <AuthInvalidator />
      <PageViewTracker />
      <GreetingGate />
      <NavigationProgress />
      <RouteErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </RouteErrorBoundary>
    </ThemeProvider>
  );
}

// Router is built once at module scope — the per-route `lazy` loaders are
// stable functions, so the data router has a stable identity across
// re-renders of `<App>`. `createRoutesFromElements` keeps the structure
// declarative. Auth is a property of the TREE: each `<AuthLayout mode>`
// gates everything nested under it, so a page never wraps itself and a new
// route cannot forget the guard.
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<RootShell />} hydrateFallbackElement={<RouteFallback />}>
      {/* Signed-OUT only. */}
      <Route element={<AuthLayout mode="unauth" />}>
        <Route path="/login" lazy={page(() => import("./pages/LoginPage"))} />
      </Route>

      {/* Public: reached via the one-time link an admin relays. The user is
          locked out, so no guard — better-auth validates the token. */}
      <Route path="/reset-password" lazy={page(() => import("./pages/ResetPasswordPage"))} />

      {/* Any signed-in member. */}
      <Route element={<AuthLayout mode="auth" />}>
        <Route index lazy={page(() => import("./pages/ProfilePage"))} />
        <Route path="/settings" lazy={page(() => import("./pages/SettingsPage"))} />
        <Route path="/offline" lazy={page(() => import("./pages/OfflineDashboard"))} />
        <Route path="/history" lazy={page(() => import("./pages/HistoryPage"))} />
      </Route>

      <Route element={<AuthLayout mode="admin" />}>
        <Route path="/admin" lazy={page(() => import("./pages/AdminPage"))} />
      </Route>

      {/* Game-night members: the directory and every player-scoped page.
          Static segments outrank the param in route ranking, so the
          sub-pages never collide with `/u/:userId` — nor with the group
          `/history` page above. */}
      <Route element={<AuthLayout mode="offline" />}>
        <Route path="/players" lazy={page(() => import("./pages/PlayersDirectoryPage"))} />
        <Route path="/u/:userId" lazy={page(() => import("./pages/PlayerProfilePage"))} />
        <Route
          path="/u/:userId/matches"
          lazy={page(() => import("./pages/PlayerMatchHistoryPage"))}
        />
        <Route path="/u/:userId/collection" lazy={page(() => import("./pages/GamesManagerPage"))} />
        <Route path="/u/:userId/nights" lazy={page(() => import("./pages/PlayerNightsPage"))} />
        <Route path="/u/:userId/skill" lazy={page(() => import("./pages/PlayerSkillPage"))} />
      </Route>

      {/* Online-gated branch: dashboard + per-game shell. `<Layout>` owns the
          page chrome (top nav, back button). Each `/play/:slug/*` sub-tree
          mounts a single `<GameShellLayout>` which owns the shared WebSocket
          and provides the `useGameShell()` context — every deeper route
          reads from there. Lazy-loading the branch keeps the games registry
          (per-game accent.json / thumbnails / lazy component wrappers and
          the bundled BGG snapshot) out of the entry chunk, so dashboard /
          login / profile cold loads stay snappy. */}
      <Route element={<AuthLayout mode="online" />}>
        <Route element={<Layout />}>
          <Route path="games" lazy={page(() => import("./components/GameMenu"))} />
          <Route
            path="play/:slug"
            lazy={named(() => import("./hooks/useGameShell"), "GameShellLayout")}
          >
            <Route index lazy={page(() => import("./components/game-shell/ModeSelectRoute"))} />
            <Route path="rules" lazy={page(() => import("./components/game-shell/RulesRoute"))} />
            {/* `solo/*` so a game component can host internal sub-routes
                (the D&D tool's hall → setup → session screens). */}
            <Route
              path="solo/*"
              lazy={named(() => import("./components/game-shell/GameRoute"), "SoloGameRoute")}
            />
            <Route
              path="companion"
              lazy={named(() => import("./components/game-shell/GameRoute"), "CompanionRoute")}
            />
            <Route
              path="bga"
              lazy={named(() => import("./components/game-shell/GameRoute"), "BgaRoute")}
            />
            <Route
              path="mp/join"
              lazy={page(() => import("./components/game-shell/JoinRoomRoute"))}
            />
            <Route
              path="mp/lobby/:roomCode"
              lazy={page(() => import("./components/game-shell/LobbyRoute"))}
            />
            <Route
              path="mp/play/:roomCode"
              lazy={named(() => import("./components/game-shell/GameRoute"), "MpGameRoute")}
            />
            <Route
              path="match-history"
              lazy={page(() => import("./components/game-shell/MatchHistoryRoute"))}
            />
            <Route
              path="match-history/:replayId"
              lazy={named(
                () => import("./components/game-shell/ReplayRoutes"),
                "MatchHistoryReplayRoute",
              )}
            />
            <Route
              path="tournament"
              lazy={named(
                () => import("./components/game-shell/TournamentRoutes"),
                "TournamentRoute",
              )}
            />
            <Route
              path="tournament/:strategyA/:strategyB/:tournamentId"
              lazy={named(
                () => import("./components/game-shell/TournamentRoutes"),
                "TournamentMatchHistoryRoute",
              )}
            />
            <Route
              path="tournament/:strategyA/:strategyB/:tournamentId/:gameIndex"
              lazy={named(
                () => import("./components/game-shell/ReplayRoutes"),
                "TournamentReplayRoute",
              )}
            />
          </Route>
        </Route>
      </Route>

      {/* Dev-only preview/gallery pages. `import.meta.env.DEV` is statically
          `false` in production builds, so the routes below vanish AND the
          dead dynamic imports (and their chunks) are dropped by the bundler —
          nothing under /dev/* ships to prod. */}
      {import.meta.env.DEV && (
        <>
          <Route path="dev/deck-preview" lazy={page(() => import("./pages/DeckPreview"))} />
          <Route path="dev/dnd-preview" lazy={page(() => import("./pages/DndNightPreview"))} />
          <Route path="dev/exit-preview" lazy={page(() => import("./pages/ExitNightPreview"))} />
          <Route path="dev/dnd-tool-preview" lazy={page(() => import("./pages/DndToolPreview"))} />
          <Route path="dev/rsvp-preview" lazy={page(() => import("./pages/RsvpPreview"))} />
          <Route path="dev/vote-preview" lazy={page(() => import("./pages/VotePreview"))} />
          <Route path="dev/decrypto-preview" lazy={page(() => import("./pages/DecryptoPreview"))} />
          <Route path="dev/senso-preview" lazy={page(() => import("./pages/SensoPreview"))} />
          <Route path="dev/skill-preview" lazy={page(() => import("./pages/SkillPreview"))} />
          <Route
            path="dev/jaipur-preview"
            lazy={page(() => import("./pages/JaipurHistoryPreview"))}
          />
          <Route
            path="dev/admin-inactive-preview"
            lazy={page(() => import("./pages/AdminInactivePreview"))}
          />
          <Route
            path="dev/purchases-preview"
            lazy={page(() => import("./pages/PurchasesPreview"))}
          />
          <Route path="dev/theme-preview" lazy={page(() => import("./pages/ThemePreview"))} />
          {/* The design-system gallery: every ui/ primitive in its variants.
              Captured by scripts/screenshot-smoke.sh as the per-primitive
              visual-regression surface. */}
          <Route path="dev/ui" lazy={page(() => import("./pages/UiGalleryPage"))} />
        </>
      )}
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
        // The greeting queue must never hydrate from disk: a nag popup has to
        // re-evaluate against the server on every app open.
        dehydrateOptions: {
          shouldDehydrateQuery: (q) =>
            defaultShouldDehydrateQuery(q) && q.queryKey[0] !== "greetings",
        },
      }}
    >
      <RouterProvider router={router} />
      {import.meta.env.DEV && <ReactQueryDevtools buttonPosition="bottom-left" />}
    </PersistQueryClientProvider>
  );
}
