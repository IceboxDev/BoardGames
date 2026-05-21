import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import GameRouter from "./GameRouter";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/games" element={<div>Games Menu</div>} />
        <Route path="/play/:slug" element={<GameRouter />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GameRouter", () => {
  it("redirects to /games when the slug is unknown", () => {
    renderAt("/play/not-a-real-slug");
    expect(screen.getByText("Games Menu")).toBeInTheDocument();
  });

  it("redirects to /games when the slug exists but has no playable component (catalog stub)", () => {
    // 'uno' is a catalog stub — registered but no `component: lazy(...)`.
    renderAt("/play/uno");
    expect(screen.getByText("Games Menu")).toBeInTheDocument();
  });

  it("renders the Suspense fallback when navigating to a playable slug", () => {
    // 'lost-cities' has a lazy component; without resolving the dynamic
    // import, the Suspense fallback renders. Asserting on the fallback is
    // enough — fully resolving the chunk would pull the entire LostCities
    // tree into the test, which is out of scope for this file.
    renderAt("/play/lost-cities");
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });
});
