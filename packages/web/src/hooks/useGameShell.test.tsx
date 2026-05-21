import { render, screen } from "@testing-library/react";
import {
  createMemoryRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// `<GameShellLayout>` mounts a real WebSocket via `useGameSession`. We
// don't care about the socket in these tests — only the slug-lookup
// and redirect contract — so mock the session module to a no-op
// triple. The mock has to live BEFORE the import of the layout so the
// module factory takes precedence.
vi.mock("../lib/ws-client", () => ({
  useGameSession: () => ({
    status: "connecting",
    sessionId: null,
    playerView: null,
    legalActions: [],
    activePlayer: 0,
    playerIndex: 0,
    aiThinking: false,
    result: null,
    replayId: null,
    error: null,
    roomCode: null,
    roomState: null,
    mySlot: null,
    createSession: vi.fn(),
    sendAction: vi.fn(),
    leaveSession: vi.fn(),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
    configureRoom: vi.fn(),
    startRoom: vi.fn(),
    kickPlayer: vi.fn(),
    toggleReady: vi.fn(),
  }),
}));

// The document-title effect doesn't matter for this surface; stub it.
vi.mock("./useDocumentTitle", () => ({ default: () => {} }));

import { GameShellLayout } from "./useGameShell";

/**
 * Build a data router for the test. `<GameShellLayout>` mounts
 * `useRoomLeaveGuard` internally, which calls `useBlocker` — that
 * requires the data-router context. A classic `<MemoryRouter>` would
 * throw "useBlocker must be used within a data router."
 */
function dataRouterAt(path: string) {
  return createMemoryRouter(
    createRoutesFromElements(
      <Route>
        <Route path="/games" element={<div>Games Menu</div>} />
        <Route path="/play/:slug" element={<GameShellLayout />}>
          <Route index element={<div>Inner index</div>} />
        </Route>
      </Route>,
    ),
    { initialEntries: [path] },
  );
}

afterEach(() => {
  // Mocks are module-scoped; vitest resets per-file.
});

describe("GameShellLayout", () => {
  it("redirects to /games when the slug is unknown", () => {
    render(<RouterProvider router={dataRouterAt("/play/not-a-real-slug")} />);
    expect(screen.getByText("Games Menu")).toBeInTheDocument();
  });

  it("redirects to /games when the slug exists but has no playable component (catalog stub)", () => {
    // 'uno' is a catalog stub — registered in the games registry but
    // without `component: lazy(...)`. Same fallthrough as an unknown
    // slug: the layout requires both a registry hit AND a component.
    render(<RouterProvider router={dataRouterAt("/play/uno")} />);
    expect(screen.getByText("Games Menu")).toBeInTheDocument();
  });

  it("renders the outlet when the slug maps to a playable game", () => {
    // 'lost-cities' has a lazy component declared. The layout doesn't
    // render the component itself (the inner solo/mp routes do) — it
    // mounts the context provider and lets the index outlet through.
    // The test asserts on the index outlet so it doesn't need to wait
    // for any lazy chunks.
    render(<RouterProvider router={dataRouterAt("/play/lost-cities")} />);
    expect(screen.getByText("Inner index")).toBeInTheDocument();
  });
});
