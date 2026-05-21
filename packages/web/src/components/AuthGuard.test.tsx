import type { SessionUser } from "@boardgames/core/protocol";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGuard } from "./AuthGuard";

// Mock the current-user hook the guard depends on. We swap in a fresh
// implementation per test so each scenario controls auth state without
// having to plumb a full session through better-auth.
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
    onlineEnabled: false,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    image: null,
    emailVerified: true,
    ...overrides,
  } as SessionUser;
}

function renderAt(initialPath: string, mode: "auth" | "unauth" | "online" | "admin") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/" element={<div>Home</div>} />
        <Route
          path="/guarded"
          element={
            <AuthGuard mode={mode}>
              <div>Protected</div>
            </AuthGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUseCurrentUser.mockReset();
});

describe("AuthGuard — loading", () => {
  it("renders a loading placeholder while session is pending", () => {
    mockUseCurrentUser.mockReturnValue({ user: null, isLoading: true, isAdmin: false });
    renderAt("/guarded", "auth");
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });
});

describe("AuthGuard — mode=auth (must be signed in)", () => {
  it("redirects to /login when user is null", () => {
    mockUseCurrentUser.mockReturnValue({ user: null, isLoading: false, isAdmin: false });
    renderAt("/guarded", "auth");
    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });

  it("renders children when user is set", () => {
    mockUseCurrentUser.mockReturnValue({ user: user(), isLoading: false, isAdmin: false });
    renderAt("/guarded", "auth");
    expect(screen.getByText("Protected")).toBeInTheDocument();
  });
});

describe("AuthGuard — mode=unauth (must NOT be signed in)", () => {
  it("renders children when no user is present", () => {
    mockUseCurrentUser.mockReturnValue({ user: null, isLoading: false, isAdmin: false });
    renderAt("/guarded", "unauth");
    expect(screen.getByText("Protected")).toBeInTheDocument();
  });

  it("redirects to / when a user is signed in", () => {
    mockUseCurrentUser.mockReturnValue({ user: user(), isLoading: false, isAdmin: false });
    renderAt("/guarded", "unauth");
    expect(screen.getByText("Home")).toBeInTheDocument();
  });
});

describe("AuthGuard — mode=online", () => {
  it("redirects to / when user.onlineEnabled is false", () => {
    mockUseCurrentUser.mockReturnValue({
      user: user({ onlineEnabled: false }),
      isLoading: false,
      isAdmin: false,
    });
    renderAt("/guarded", "online");
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("renders children when user.onlineEnabled is true", () => {
    mockUseCurrentUser.mockReturnValue({
      user: user({ onlineEnabled: true }),
      isLoading: false,
      isAdmin: false,
    });
    renderAt("/guarded", "online");
    expect(screen.getByText("Protected")).toBeInTheDocument();
  });

  it("redirects to /login when no user (online check requires auth too)", () => {
    mockUseCurrentUser.mockReturnValue({ user: null, isLoading: false, isAdmin: false });
    renderAt("/guarded", "online");
    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });
});

describe("AuthGuard — mode=admin", () => {
  it("redirects to / for non-admin signed-in user", () => {
    mockUseCurrentUser.mockReturnValue({
      user: user({ role: "user" }),
      isLoading: false,
      isAdmin: false,
    });
    renderAt("/guarded", "admin");
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("renders children for admin", () => {
    mockUseCurrentUser.mockReturnValue({
      user: user({ role: "admin" }),
      isLoading: false,
      isAdmin: true,
    });
    renderAt("/guarded", "admin");
    expect(screen.getByText("Protected")).toBeInTheDocument();
  });

  it("redirects to /login when no user", () => {
    mockUseCurrentUser.mockReturnValue({ user: null, isLoading: false, isAdmin: false });
    renderAt("/guarded", "admin");
    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });
});
