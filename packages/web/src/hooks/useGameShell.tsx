import { createContext, type ReactNode, useContext, useMemo } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { games } from "../games/registry";
import type { GameDefinition } from "../games/types";
import { type GameSession, useGameSession } from "../lib/ws-client";
import useDocumentTitle from "./useDocumentTitle";
import { type MultiplayerRoomState, useMultiplayerRoom } from "./useMultiplayerRoom";
import { type RemoteGameState, useRemoteGame } from "./useRemoteGame";
import { useRoomLeaveGuard } from "./useRoomLeaveGuard";

// ── Source ────────────────────────────────────────────────────────────────
//
// Whether the current sub-route reads from the solo session (`game`) or
// the multiplayer room (`mp`). Game components accept this as a prop —
// `<LostCities source="solo" />` vs `<LostCities source="mp" />` — so the
// SAME chunk renders both routes and the per-game logic stays in one
// file. The route element wrappers in `App.tsx` set the prop based on the
// URL.

export type GameSource = "solo" | "mp";

// ── Context shape ─────────────────────────────────────────────────────────
//
// Owned by `<GameShellLayout>` (one mount per `/play/:slug` route), read
// by every child route. Each layout mounts ONE WebSocket via
// `useGameSession`; both projections (`game` for solo, `mp` for room
// gameplay) read from that single session, so solo and multiplayer never
// race for state and there is never more than one connection per slug.
//
// Per-game payload types are generic at the call site: callers do
// `useGameShell<MyView, MyAction, MyResult>()` and receive a typed
// projection. The context itself stores `unknown`; the hook does a
// single cast at the boundary.

export interface GameShellValue<TView, TAction, TResult> {
  /** Game registry entry. Always defined inside a layout. */
  def: GameDefinition;
  /** Shared raw session (WebSocket + state). Prefer `game` / `mp` projections. */
  session: GameSession<TView, TAction, TResult>;
  /** Solo (vs-AI) projection. */
  game: RemoteGameState<TView, TAction, TResult>;
  /** Multiplayer-room projection. */
  mp: MultiplayerRoomState<TView, TAction, TResult>;
}

const GameShellContext = createContext<GameShellValue<unknown, unknown, unknown> | null>(null);

/**
 * Hook used by every game's component and every screen sub-route to read
 * the shared shell state.
 *
 * Generics let the caller name the per-game payload types so consumer
 * code stays type-safe even though the context stores `unknown`. We do
 * exactly one cast here at the boundary; downstream sees a fully typed
 * `RemoteGameState<MyView, ...>` / `MultiplayerRoomState<...>` triple.
 *
 * Throws if used outside `<GameShellLayout>` — that error is loud on
 * purpose so a misplaced component is caught at first render rather than
 * silently rendering with `undefined` state.
 */
// biome-ignore lint/style/useComponentExportOnlyModules: paired with <GameShellLayout> so games can import both via a single source file
export function useGameShell<
  TView = unknown,
  TAction = unknown,
  TResult = unknown,
>(): GameShellValue<TView, TAction, TResult> {
  const ctx = useContext(GameShellContext);
  if (!ctx) {
    throw new Error(
      "useGameShell must be used inside <GameShellLayout> (mounted at /play/:slug/*)",
    );
  }
  return ctx as unknown as GameShellValue<TView, TAction, TResult>;
}

// ── Layout (route element) ────────────────────────────────────────────────
//
// Mount at `/play/:slug/*`. Looks up the GameDefinition by slug; redirects
// to `/games` if the slug is unknown or the game has no playable
// component. Once mounted, owns the single WebSocket for the lifetime of
// the /play/:slug visit — child routes mount and unmount within this
// without disturbing the session.

/**
 * Inner layout. Wraps the actual session/projection wiring so that the
 * outer `<GameShellLayout>` can do the slug→def lookup AND the unknown-
 * slug redirect before we ever instantiate `useGameSession`. That order
 * matters: opening a WebSocket on an invalid /play/:slug would leak a
 * connection on every typo.
 */
function GameShellLayoutInner({ def, children }: { def: GameDefinition; children?: ReactNode }) {
  useDocumentTitle(`${def.title} - Board Games`);

  // Single session per /play/:slug mount. Both `useRemoteGame` (solo
  // projection) and `useMultiplayerRoom` (room projection) read from it.
  const session = useGameSession<unknown, unknown, unknown>();
  const game = useRemoteGame<unknown, unknown, unknown>(def.slug, session);
  const mp = useMultiplayerRoom<unknown, unknown, unknown>(def.slug, session);

  const value = useMemo<GameShellValue<unknown, unknown, unknown>>(
    () => ({ def, session, game, mp }),
    [def, session, game, mp],
  );

  return (
    <GameShellContext.Provider value={value}>
      <RoomLeaveGuardMount />
      {children ?? <Outlet />}
    </GameShellContext.Provider>
  );
}

/**
 * Minimal mount-point for {@link useRoomLeaveGuard}. The guard hook
 * reads from `useGameShell()`, which requires it to live BENEATH the
 * `<GameShellContext.Provider>`. Kept as a zero-render component so
 * the cost is just two extra fiber nodes per shell mount.
 */
function RoomLeaveGuardMount() {
  useRoomLeaveGuard();
  return null;
}

/**
 * `/play/:slug/*` route element. Resolve the slug or bail out — every
 * deeper route can rely on `useGameShell()` returning a defined `def`
 * without re-checking.
 *
 * The redirect targets `/games` (the menu) on bad slugs, which is the
 * same place the previous `<GameRouter>` sent the user. Keep that
 * destination stable so existing bookmarks degrade gracefully.
 */
export function GameShellLayout({ children }: { children?: ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const def = slug ? games.find((g) => g.slug === slug) : undefined;
  if (!def || !def.component) {
    return <Navigate to="/games" replace />;
  }
  return <GameShellLayoutInner def={def}>{children}</GameShellLayoutInner>;
}
