import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthGuard } from "./components/AuthGuard";
import { AuthInvalidator } from "./components/AuthInvalidator";
import Layout from "./components/Layout";
import { queryClient } from "./lib/query-client";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const OfflineDashboard = lazy(() => import("./pages/OfflineDashboard"));
const GameGallery = lazy(() => import("./pages/GameGallery"));
const DeckPreview = lazy(() => import("./pages/DeckPreview"));
// `GameMenu` and `GameRouter` are the only paths that pull the games registry
// into the bundle. Lazy-loading them keeps the registry's 81 game modules
// (bgg.json, accent.json, thumbnail urls, lazy component wrappers) out of
// the entry chunk, so dashboard / login / profile cold loads stay snappy.
const GameMenu = lazy(() => import("./components/GameMenu"));
const GameRouter = lazy(() => import("./components/GameRouter"));

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthInvalidator />
        <Suspense fallback={null}>
          <Routes>
            <Route
              path="/login"
              element={
                <AuthGuard mode="unauth">
                  <LoginPage />
                </AuthGuard>
              }
            />

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
              path="/gallery"
              element={
                <AuthGuard mode="auth">
                  <GameGallery />
                </AuthGuard>
              }
            />

            <Route
              element={
                <AuthGuard mode="online">
                  <Layout />
                </AuthGuard>
              }
            >
              <Route path="games" element={<GameMenu />} />
              <Route path="play/:slug" element={<GameRouter />} />
            </Route>

            <Route path="dev/deck-preview" element={<DeckPreview />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools buttonPosition="bottom-left" />}
    </QueryClientProvider>
  );
}
