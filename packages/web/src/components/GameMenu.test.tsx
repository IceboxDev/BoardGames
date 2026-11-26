import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { testQueryClient } from "../test/query-client";

// The library's filters survive going into a game and coming back: they live
// in the URL, so the back button brings them with it.

vi.mock("../hooks/useCurrentUser.ts", () => ({
  useCurrentUser: () => ({ user: null, isLoading: false, isAdmin: true }),
}));

const { default: GameMenu } = await import("./GameMenu");

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      { path: "/games", element: <GameMenu /> },
      { path: "/play/:slug", element: <p>game page</p> },
    ],
    { initialEntries: [url] },
  );
  render(
    <QueryClientProvider client={testQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("GameMenu filters", () => {
  it("reads the filters from the URL", () => {
    renderAt("/games?players=2&playable=1");
    expect(screen.getByDisplayValue("2 players")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /playable/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps a filter across a visit to a game and back", async () => {
    const router = renderAt("/games");
    fireEvent.click(screen.getByRole("button", { name: /playable/i }));
    expect(router.state.location.search).toBe("?playable=1");
    await router.navigate("/play/chess");
    await router.navigate(-1);
    expect(
      await screen.findByRole("button", { name: /playable/i, pressed: true }),
    ).toBeInTheDocument();
  });
});
