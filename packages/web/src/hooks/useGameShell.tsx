import { gameRoomConfigs } from "@boardgames/core/protocol/room-config";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { JoinRoom, Lobby, ModeSelect } from "../components/multiplayer";
import { TournamentGrid, TournamentMatchHistory } from "../components/tournament";
import { games } from "../games/registry";
import type { GameDefinition } from "../games/types";
import { useGameSession } from "../lib/ws-client";
import useDocumentTitle from "./useDocumentTitle";
import { useGameBackOverride } from "./useGameBackOverride";
import type { MultiplayerRoomState } from "./useMultiplayerRoom";
import { useMultiplayerRoom } from "./useMultiplayerRoom";
import type { RemoteGameState } from "./useRemoteGame";
import { useRemoteGame } from "./useRemoteGame";

export type ShellMode =
  | "menu"
  | "solo"
  | "mp-join"
  | "mp-lobby"
  | "mp-playing"
  | "match-history"
  | "tournament";

export interface GameShellResult<TView, TAction, TResult> {
  mode: ShellMode;
  def: GameDefinition;
  game: RemoteGameState<TView, TAction, TResult>;
  mp: MultiplayerRoomState<TView, TAction, TResult>;
  /** Shell-rendered screen (mode select, join room, lobby), or null when the game should render. */
  screen: ReactNode | null;
  /** Navigate back to mode selection, resetting game & mp state. */
  goToMenu: () => void;
  /** Pass-through for game-level back overrides. */
  setBackOverride: (fn: (() => void) | null) => void;
}

interface GameShellOptions<TView, TAction, TResult> {
  /** Custom children rendered inside the Lobby (e.g. difficulty selector). */
  renderLobbyContent?: (mp: MultiplayerRoomState<TView, TAction, TResult>) => ReactNode;
  /** Config object passed to mp.startRoom() when the host starts from the lobby. */
  getLobbyStartConfig?: () => unknown;
  /** Optional callback for exporting tournament game logs (e.g. Lost Cities human-readable format). */
  tournamentExportLogFn?: (game: unknown) => unknown;
  /** Optional callback when a tournament game is selected (e.g. for replay). */
  tournamentOnSelectGame?: (game: unknown) => void;
}

export function useGameShell<TView = unknown, TAction = unknown, TResult = unknown>(
  slug: string,
  options?: GameShellOptions<TView, TAction, TResult>,
): GameShellResult<TView, TAction, TResult> {
  const def = games.find((g) => g.slug === slug) as GameDefinition;

  useDocumentTitle(`${def.title} - Board Games`);

  // ONE WebSocket per game shell. Both projections read from this shared session
  // so solo and multiplayer state never go out of sync, and there's never more
  // than one open connection per route. Previously each projection opened its
  // own WS, doubling reconnect storms and creating split state.
  const session = useGameSession<TView, TAction, TResult>();
  const game = useRemoteGame<TView, TAction, TResult>(slug, session);
  const mp = useMultiplayerRoom<TView, TAction, TResult>(slug, session);
  const [mode, setMode] = useState<ShellMode>("menu");
  const { setBackOverride } = useGameBackOverride();

  // Tournament sub-navigation state
  const [tournamentMatchPair, setTournamentMatchPair] = useState<{
    aId: string;
    bId: string;
    tournamentId: string;
  } | null>(null);

  // Track multiplayer phase transitions
  useEffect(() => {
    if (mp.phase === "lobby" && mode === "mp-join") setMode("mp-lobby");
    if (mp.phase === "playing" && mode !== "mp-playing") setMode("mp-playing");
  }, [mp.phase, mode]);

  // Back overrides for shell-owned screens
  useEffect(() => {
    if (mode === "mp-join") {
      setBackOverride(() => setMode("menu"));
      return () => setBackOverride(null);
    }
    if (mode === "mp-lobby") {
      setBackOverride(() => {
        mp.leaveRoom();
        setMode("menu");
      });
      return () => setBackOverride(null);
    }
    if (mode === "tournament") {
      if (tournamentMatchPair) {
        setBackOverride(() => setTournamentMatchPair(null));
      } else {
        setBackOverride(() => {
          setTournamentMatchPair(null);
          setMode("menu");
        });
      }
      return () => setBackOverride(null);
    }
    return undefined;
  }, [mode, tournamentMatchPair, setBackOverride, mp.leaveRoom]);

  const goToMenu = useCallback(() => {
    game.reset();
    mp.reset();
    setTournamentMatchPair(null);
    setMode("menu");
  }, [game.reset, mp.reset]);

  // Compute shell screen
  let screen: ReactNode | null = null;

  if (mode === "menu") {
    screen = (
      <ModeSelect
        title={def.title}
        subtitle={undefined}
        soloLabel={def.soloLabel}
        rulesUrl={def.rulesUrl}
        onSolo={() => setMode("solo")}
        onMultiplayer={() => setMode("mp-join")}
        onMatchHistory={def.hasMatchHistory ? () => setMode("match-history") : undefined}
        onTournament={def.hasTournament ? () => setMode("tournament") : undefined}
      />
    );
  } else if (mode === "mp-join") {
    screen = (
      <JoinRoom
        title={def.title}
        onCreateRoom={(name) => mp.createRoom(name)}
        onJoinRoom={(code, name) => mp.joinRoom(code, name)}
        onBack={() => setMode("menu")}
        error={mp.error}
      />
    );
  } else if (mode === "mp-lobby" && mp.roomCode && mp.roomState) {
    screen = (
      <Lobby
        roomCode={mp.roomCode}
        roomState={mp.roomState}
        mySlot={mp.mySlot ?? 0}
        isHost={mp.isHost}
        roomConfig={gameRoomConfigs[slug]}
        onStart={() => mp.startRoom(options?.getLobbyStartConfig?.() ?? {})}
        onLeave={() => {
          mp.leaveRoom();
          setMode("menu");
        }}
        onKick={(i) => mp.kickPlayer(i)}
        onToggleReady={() => mp.toggleReady()}
        error={mp.error}
      >
        {options?.renderLobbyContent?.(mp)}
      </Lobby>
    );
  } else if (mode === "tournament" && def.tournamentStrategies) {
    if (tournamentMatchPair) {
      screen = (
        <TournamentMatchHistory
          strategies={def.tournamentStrategies}
          strategyAId={tournamentMatchPair.aId}
          strategyBId={tournamentMatchPair.bId}
          tournamentId={tournamentMatchPair.tournamentId}
          onBack={() => setTournamentMatchPair(null)}
          onSelectGame={options?.tournamentOnSelectGame}
          exportLogFn={options?.tournamentExportLogFn}
        />
      );
    } else {
      screen = (
        <TournamentGrid
          gameSlug={slug}
          strategies={def.tournamentStrategies}
          showScoreDiff={def.tournamentShowScoreDiff}
          onViewMatchHistory={(aId, bId, tournamentId) =>
            setTournamentMatchPair({ aId, bId, tournamentId })
          }
        />
      );
    }
  }

  return { mode, def, game, mp, screen, goToMenu, setBackOverride };
}
