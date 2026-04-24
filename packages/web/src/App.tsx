import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import GameMenu from "./components/GameMenu";
import GameRouter from "./components/GameRouter";
import Layout from "./components/Layout";

const DeckPreview = lazy(() => import("./pages/DeckPreview"));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<GameMenu />} />
          <Route path="play/:slug" element={<GameRouter />} />
        </Route>
        <Route
          path="dev/deck-preview"
          element={
            <Suspense>
              <DeckPreview />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
