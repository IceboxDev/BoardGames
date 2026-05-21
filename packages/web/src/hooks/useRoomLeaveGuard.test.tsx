import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryRouter,
  createRoutesFromElements,
  Link,
  Outlet,
  Route,
  RouterProvider,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the shell context — the guard reads `def / session / game / mp`
// only. Each test sets up the context shape it cares about, and we
// observe whether the hook attaches a `beforeunload` listener and
// whether it blocks in-app navigation correctly.

const leaveRoom = vi.fn();
const leaveSession = vi.fn();
const useGameShellMock = vi.fn();

vi.mock("./useGameShell", () => ({
  useGameShell: () => useGameShellMock(),
}));

import { useRoomLeaveGuard } from "./useRoomLeaveGuard";

function setupContext(opts: { slug?: string; roomCode?: string | null; view?: unknown }) {
  useGameShellMock.mockReturnValue({
    def: { slug: opts.slug ?? "lost-cities" },
    session: { leaveRoom, leaveSession },
    game: { view: opts.view ?? null },
    mp: { roomCode: opts.roomCode ?? null },
  });
}

// biome-ignore lint/style/useComponentExportOnlyModules: test-local mount point for the hook; never exported
function Harness() {
  useRoomLeaveGuard();
  return null;
}

/**
 * Build a data router (`createMemoryRouter`) at the requested initial
 * path. `useBlocker` requires the data-router context — the guard
 * calls it unconditionally, so every test goes through this builder
 * even when we only care about the `beforeunload` path. `<Harness>`
 * mounts under the root route so the hook runs alongside the route
 * tree's navigation. `navTo` is the link's destination; tests that
 * don't actually click the link can pass any path.
 */
function dataRouterAt(initialPath: string, navTo: string) {
  return createMemoryRouter(
    createRoutesFromElements(
      <Route
        element={
          <>
            <Harness />
            <Link to={navTo}>go</Link>
            <Outlet />
          </>
        }
      >
        <Route path="/play/:slug" element={null} />
        <Route path="/play/:slug/mp/play/:roomCode" element={null} />
        <Route path={navTo} element={<div>arrived</div>} />
      </Route>,
    ),
    { initialEntries: [initialPath] },
  );
}

beforeEach(() => {
  leaveRoom.mockReset();
  leaveSession.mockReset();
  useGameShellMock.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useRoomLeaveGuard — beforeunload", () => {
  it("attaches a beforeunload listener when mp.roomCode is set", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    setupContext({ roomCode: "ABCD" });
    render(<RouterProvider router={dataRouterAt("/play/lost-cities", "/games")} />);
    expect(addSpy.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);
  });

  it("attaches a beforeunload listener when only game.view is set (solo in flight)", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    setupContext({ view: { mock: "view" } });
    render(<RouterProvider router={dataRouterAt("/play/lost-cities", "/games")} />);
    expect(addSpy.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);
  });

  it("does NOT attach a listener when there's no active session state", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    setupContext({ roomCode: null, view: null });
    render(<RouterProvider router={dataRouterAt("/play/lost-cities", "/games")} />);
    expect(addSpy.mock.calls.some(([type]) => type === "beforeunload")).toBe(false);
  });

  it("removes the listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    setupContext({ roomCode: "ABCD" });
    const { unmount } = render(
      <RouterProvider router={dataRouterAt("/play/lost-cities", "/games")} />,
    );
    unmount();
    expect(removeSpy.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);
  });

  it("calls preventDefault when beforeunload fires (triggers the browser dialog)", () => {
    setupContext({ roomCode: "ABCD" });
    render(<RouterProvider router={dataRouterAt("/play/lost-cities", "/games")} />);
    const evt = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    Object.defineProperty(evt, "returnValue", { value: undefined, writable: true });
    const preventDefault = vi.spyOn(evt, "preventDefault");
    window.dispatchEvent(evt);
    expect(preventDefault).toHaveBeenCalled();
  });
});

describe("useRoomLeaveGuard — in-app blocker", () => {
  it("does NOT block navigation that stays inside /play/:slug", async () => {
    setupContext({ roomCode: "ABCD" });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <RouterProvider
        router={dataRouterAt("/play/lost-cities", "/play/lost-cities/mp/play/ABCD")}
      />,
    );
    await userEvent.click(screen.getByText("go"));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("blocks navigation that leaves /play/:slug and proceeds when the user confirms", async () => {
    setupContext({ roomCode: "ABCD" });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RouterProvider router={dataRouterAt("/play/lost-cities", "/games")} />);
    await userEvent.click(screen.getByText("go"));
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(leaveRoom).toHaveBeenCalledOnce();
    expect(leaveSession).toHaveBeenCalledOnce();
    expect(await screen.findByText("arrived")).toBeInTheDocument();
  });

  it("blocks navigation and cancels when the user declines", async () => {
    setupContext({ roomCode: "ABCD" });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RouterProvider router={dataRouterAt("/play/lost-cities", "/games")} />);
    await userEvent.click(screen.getByText("go"));
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(leaveRoom).not.toHaveBeenCalled();
    expect(leaveSession).not.toHaveBeenCalled();
    expect(screen.queryByText("arrived")).toBeNull();
    expect(screen.getByText("go")).toBeInTheDocument();
  });

  it("does NOT block navigation when no active session state", async () => {
    setupContext({ roomCode: null, view: null });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RouterProvider router={dataRouterAt("/play/lost-cities", "/games")} />);
    await userEvent.click(screen.getByText("go"));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await screen.findByText("arrived")).toBeInTheDocument();
  });
});
