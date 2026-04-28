import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthGuard } from "./components/AuthGuard";
import GameMenu from "./components/GameMenu";
import GameRouter from "./components/GameRouter";
import Layout from "./components/Layout";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const OfflineDashboard = lazy(() => import("./pages/OfflineDashboard"));
const DeckPreview = lazy(() => import("./pages/DeckPreview"));

export default function App() {
  return (
    <BrowserRouter>
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
  );
}
