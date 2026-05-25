import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  createMemoryRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// react-pdf needs a PDF worker + network; stub it so the rules viewer renders
// its chrome (the "Game Rules" header) without the PDF machinery.
vi.mock("react-pdf", () => ({
  Document: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Page: () => null,
  pdfjs: { GlobalWorkerOptions: {}, version: "test" },
}));

const useGameShellMock = vi.fn();
vi.mock("../../hooks/useGameShell", () => ({
  useGameShell: () => useGameShellMock(),
}));

import ModeSelectRoute from "./ModeSelectRoute";
import RulesRoute from "./RulesRoute";

// Mount the real `/play/:slug` index + `rules` sub-route, plus a `/games`
// sentinel so we can prove Back does NOT fall through to the catalog (the bug).
function setup() {
  useGameShellMock.mockReturnValue({
    def: {
      slug: "lost-cities",
      title: "Lost Cities",
      soloLabel: "Play vs AI",
      rulesUrl: "/rules/lost-cities.pdf",
      hasMatchHistory: false,
      hasTournament: false,
    },
  });
  const router = createMemoryRouter(
    createRoutesFromElements(
      <>
        <Route path="/games" element={<div>GAME MENU</div>} />
        <Route path="/play/:slug">
          <Route index element={<ModeSelectRoute />} />
          <Route path="rules" element={<RulesRoute />} />
        </Route>
      </>,
    ),
    { initialEntries: ["/games", "/play/lost-cities"], initialIndex: 1 },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const howToPlay = () => screen.findByRole("button", { name: /how to play/i });

afterEach(() => {
  useGameShellMock.mockReset();
  vi.restoreAllMocks();
});

describe("rules viewer — back-button behavior", () => {
  it("opening the rules navigates to /play/:slug/rules and shows the viewer", async () => {
    const router = setup();
    await userEvent.click(await howToPlay());
    expect(await screen.findByText("Game Rules")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/play/lost-cities/rules");
  });

  it("Back closes the rules and returns to the menu — NOT to /games", async () => {
    const router = setup();
    await userEvent.click(await howToPlay());
    await screen.findByText("Game Rules");

    // Simulate the browser/OS Back button.
    await router.navigate(-1);

    await waitFor(() => expect(screen.queryByText("Game Rules")).toBeNull());
    expect(router.state.location.pathname).toBe("/play/lost-cities");
    expect(screen.queryByText("GAME MENU")).toBeNull();
    expect(await howToPlay()).toBeInTheDocument();
  });

  it("the X button also closes back to the menu, not the catalog", async () => {
    const router = setup();
    await userEvent.click(await howToPlay());
    await screen.findByText("Game Rules");

    await userEvent.click(screen.getByRole("button", { name: /close rules/i }));

    await waitFor(() => expect(screen.queryByText("Game Rules")).toBeNull());
    expect(router.state.location.pathname).toBe("/play/lost-cities");
    expect(screen.queryByText("GAME MENU")).toBeNull();
  });

  it("a game with no rulebook shows no rules button", () => {
    useGameShellMock.mockReturnValue({
      def: { slug: "set", title: "Set", soloLabel: "Trainer" },
    });
    const router = createMemoryRouter(
      createRoutesFromElements(<Route path="/play/:slug" element={<ModeSelectRoute />} />),
      { initialEntries: ["/play/set"] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.queryByRole("button", { name: /how to play/i })).toBeNull();
  });
});
