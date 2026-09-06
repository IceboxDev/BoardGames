import type { SessionUser } from "@boardgames/core/protocol";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthLayout } from "./AuthLayout";

vi.mock("../hooks/useCurrentUser.ts", () => ({
  useCurrentUser: vi.fn(),
}));

import { useCurrentUser } from "../hooks/useCurrentUser.ts";

const mockUseCurrentUser = vi.mocked(useCurrentUser);

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "u1",
    email: "u1@example.com",
    name: "User One",
    role: "user",
    onlineMode: "offline",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    image: null,
    emailVerified: true,
    ...overrides,
  } as SessionUser;
}

// One layout route gates two sibling pages; the guard's mode is a property
// of the tree, not repeated per page.
function renderAt(path: string, mode: "auth" | "offline" | "admin") {
  const router = createMemoryRouter(
    [
      { path: "/login", element: <div>Login Page</div> },
      { path: "/", element: <div>Home</div> },
      {
        element: <AuthLayout mode={mode} />,
        children: [
          { path: "/a", element: <div>Page A</div> },
          { path: "/b", element: <div>Page B</div> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => mockUseCurrentUser.mockReset());

describe("AuthLayout", () => {
  it("renders the matched child page through the outlet when the guard passes", () => {
    mockUseCurrentUser.mockReturnValue({ user: user(), isLoading: false, isAdmin: false });
    renderAt("/b", "auth");
    expect(screen.getByText("Page B")).toBeInTheDocument();
    expect(screen.queryByText("Page A")).toBeNull();
  });

  it("gates every child with the one mode — offline mode bounces an online-only user", () => {
    mockUseCurrentUser.mockReturnValue({
      user: user({ onlineMode: "online" }),
      isLoading: false,
      isAdmin: false,
    });
    renderAt("/a", "offline");
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("redirects a signed-out visitor to /login before any child renders", () => {
    mockUseCurrentUser.mockReturnValue({ user: null, isLoading: false, isAdmin: false });
    renderAt("/a", "admin");
    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });

  it("shows the shared route fallback (on the grid background) while the session loads", () => {
    mockUseCurrentUser.mockReturnValue({ user: null, isLoading: true, isAdmin: false });
    const { container } = renderAt("/a", "auth");
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect((container.firstChild as HTMLElement).className).toContain("bg-grid");
  });
});
