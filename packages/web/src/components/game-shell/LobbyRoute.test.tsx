import type { RoomState, SessionUser } from "@boardgames/core/protocol";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the session and current-user hooks. The lobby route does three
// things we want to verify: (1) rejoin on direct entry when the URL
// roomCode doesn't match the session, (2) navigate to /mp/play on game
// start, (3) render the room chrome when the session has a roomState.
//
// Mocks are declared before importing the route component so the
// factory takes effect at module load.

const joinRoom = vi.fn();
const createRoom = vi.fn();
const leaveRoom = vi.fn();
const startRoom = vi.fn();
const kickPlayer = vi.fn();
const toggleReady = vi.fn();
const useGameShellMock = vi.fn();

vi.mock("../../hooks/useGameShell", () => ({
  useGameShell: () => useGameShellMock(),
  // GameSource etc. aren't read by the route — re-export shape kept minimal.
}));

vi.mock("../../hooks/useCurrentUser.ts", () => ({
  useCurrentUser: () => ({
    user: { name: "Test User" } as SessionUser,
    isLoading: false,
    isAdmin: false,
  }),
}));

import LobbyRoute from "./LobbyRoute";

type MpStub = {
  isConnected: boolean;
  roomCode: string | null;
  roomState: RoomState | null;
  mySlot: number | null;
  isHost: boolean;
  phase: "idle" | "lobby" | "playing";
  error: string | null;
  joinRoom: typeof joinRoom;
  createRoom: typeof createRoom;
  leaveRoom: typeof leaveRoom;
  startRoom: typeof startRoom;
  kickPlayer: typeof kickPlayer;
  toggleReady: typeof toggleReady;
};

function emptyRoomState(): RoomState {
  return {
    gameSlug: "lost-cities",
    hostUserId: "u1",
    slots: [
      { kind: "human", playerName: "Test User", ready: false, connected: true },
      { kind: "human", playerName: "Opponent", ready: false, connected: true },
    ],
    started: false,
  } as unknown as RoomState;
}

function setupContext(mp: Partial<MpStub>) {
  useGameShellMock.mockReturnValue({
    def: {
      slug: "lost-cities",
      title: "Lost Cities",
      defaultMpConfig: {},
    },
    session: {},
    game: {},
    mp: {
      isConnected: true,
      roomCode: null,
      roomState: null,
      mySlot: 0,
      isHost: true,
      phase: "idle",
      error: null,
      joinRoom,
      createRoom,
      leaveRoom,
      startRoom,
      kickPlayer,
      toggleReady,
      ...mp,
    },
  });
}

function renderAt(path: string, children?: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/play/:slug/mp/lobby/:roomCode" element={<LobbyRoute />} />
        <Route path="/play/:slug/mp/play/:roomCode" element={<div>Game Board</div>} />
        <Route path="/play/:slug/mp/join" element={<div>Join Room</div>} />
        <Route path="/play/:slug" element={<div>Mode Select</div>} />
        {children}
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  joinRoom.mockReset();
  startRoom.mockReset();
  leaveRoom.mockReset();
  useGameShellMock.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("LobbyRoute", () => {
  it("rejoins the URL roomCode when the session isn't in it yet (refresh path)", () => {
    setupContext({ isConnected: true, roomCode: null });
    renderAt("/play/lost-cities/mp/lobby/ABCD");
    // The effect fires once on mount; assert we asked the session to
    // join with the URL code and the session-user-derived display name.
    expect(joinRoom).toHaveBeenCalledWith("ABCD", "Test User");
  });

  it("does NOT call joinRoom when the session is already in the URL room", () => {
    setupContext({
      isConnected: true,
      roomCode: "ABCD",
      roomState: emptyRoomState(),
    });
    renderAt("/play/lost-cities/mp/lobby/ABCD");
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it("waits to call joinRoom until the socket is connected", () => {
    setupContext({ isConnected: false, roomCode: null });
    renderAt("/play/lost-cities/mp/lobby/ABCD");
    // Firing `joinRoom` over a closed socket drops the message; the
    // route correctly waits for `isConnected`. The session itself
    // also queues a pending rejoin on reconnect, so the user is still
    // covered.
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it("renders a holding screen while waiting for roomState", () => {
    setupContext({ isConnected: true, roomCode: "ABCD", roomState: null });
    renderAt("/play/lost-cities/mp/lobby/ABCD");
    expect(screen.getByText(/Joining room ABCD/)).toBeInTheDocument();
  });

  it("renders the Lobby chrome once the session has a roomState", () => {
    setupContext({
      isConnected: true,
      roomCode: "ABCD",
      roomState: emptyRoomState(),
      phase: "lobby",
    });
    renderAt("/play/lost-cities/mp/lobby/ABCD");
    // The Lobby component renders the room code prominently.
    expect(screen.getByText("ABCD")).toBeInTheDocument();
    // Slot row for the player.
    expect(screen.getByText("Test User")).toBeInTheDocument();
  });

  it("navigates to /mp/play/:code when the phase flips to 'playing' (game started)", () => {
    setupContext({
      isConnected: true,
      roomCode: "ABCD",
      roomState: emptyRoomState(),
      phase: "playing",
    });
    renderAt("/play/lost-cities/mp/lobby/ABCD");
    expect(screen.getByText("Game Board")).toBeInTheDocument();
  });
});
