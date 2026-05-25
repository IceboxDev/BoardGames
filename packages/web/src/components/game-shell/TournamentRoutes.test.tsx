import { render, screen } from "@testing-library/react";
import {
  createMemoryRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const useGameShellMock = vi.fn();
vi.mock("../../hooks/useGameShell", () => ({
  useGameShell: () => useGameShellMock(),
}));

import { TournamentRoute } from "./TournamentRoutes";

function renderAt(def: Record<string, unknown>) {
  useGameShellMock.mockReturnValue({ def });
  const router = createMemoryRouter(
    createRoutesFromElements(
      <>
        <Route path="/play/:slug" element={<div>MODE SELECT</div>} />
        <Route path="/play/:slug/tournament" element={<TournamentRoute />} />
      </>,
    ),
    { initialEntries: ["/play/pandemic/tournament"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  useGameShellMock.mockReset();
  vi.restoreAllMocks();
});

describe("TournamentRoute", () => {
  it("shows a coming-soon placeholder when the tournament is enabled but strategies aren't defined", () => {
    renderAt({ slug: "pandemic", title: "Pandemic", hasTournament: true });
    expect(screen.getByRole("heading", { name: /ai tournament/i })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByText("MODE SELECT")).toBeNull();
  });

  it("redirects to mode select when the game has no tournament", () => {
    renderAt({ slug: "pandemic", title: "Pandemic" });
    expect(screen.getByText("MODE SELECT")).toBeInTheDocument();
  });
});
