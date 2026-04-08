import type { StrategyId } from "@boardgames/core/games/sushi-go/ai/strategy";
import { ALL_STRATEGIES } from "@boardgames/core/games/sushi-go/ai/strategy";
import type {
  SushiGoEvent,
  SushiGoPlayerView,
  SushiGoResult,
} from "@boardgames/core/games/sushi-go/machine";
import type { SushiGoAction } from "@boardgames/core/games/sushi-go/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { TournamentGrid, TournamentMatchHistory } from "../../components/tournament";
import { useGameShell } from "../../hooks/useGameShell";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

export default function SushiGo() {
  const shell = useGameShell<SushiGoPlayerView, SushiGoEvent, SushiGoResult>("sushi-go");

  const [lastPlayerCount, setLastPlayerCount] = useState(3);
  const [lastStrategyId, setLastStrategyId] = useState<StrategyId>("nash");
  const [showResults, setShowResults] = useState(false);
  const [matchHistoryPair, setMatchHistoryPair] = useState<{
    aId: string;
    bId: string;
    tournamentId: string;
  } | null>(null);
  const lastViewRef = useRef<SushiGoPlayerView | null>(null);

  // Keep a snapshot of the last view for showing board state after game-over
  if (shell.game.view) lastViewRef.current = shell.game.view;
  if (shell.mp.view) lastViewRef.current = shell.mp.view;

  // Back overrides for game-managed modes
  useEffect(() => {
    if (shell.mode === "tournament") {
      if (matchHistoryPair) {
        shell.setBackOverride(() => setMatchHistoryPair(null));
      } else {
        shell.setBackOverride(shell.goToMenu);
      }
      return () => shell.setBackOverride(null);
    }
    if (shell.mode === "solo") {
      shell.setBackOverride(() => {
        setShowResults(false);
        shell.goToMenu();
      });
      return () => shell.setBackOverride(null);
    }
    if (shell.mode === "mp-playing") {
      shell.setBackOverride(() => {
        setShowResults(false);
        shell.goToMenu();
      });
      return () => shell.setBackOverride(null);
    }
    return undefined;
  }, [shell.mode, matchHistoryPair, shell.goToMenu, shell.setBackOverride]);

  const handleSoloStart = useCallback(
    (playerCount: number, strategyId: StrategyId) => {
      setLastPlayerCount(playerCount);
      setLastStrategyId(strategyId);
      shell.game.start({ playerCount, humanPlayers: [0], strategyId });
    },
    [shell.game.start],
  );

  const handleSoloAction = useCallback(
    (action: SushiGoAction) => {
      shell.game.send({ type: "PLAYER_ACTION", playerIndex: 0, action } as SushiGoEvent);
    },
    [shell.game.send],
  );

  const handleMpAction = useCallback(
    (action: SushiGoAction) => {
      shell.mp.send({ type: "PLAYER_ACTION", action } as SushiGoEvent);
    },
    [shell.mp.send],
  );

  // --- Shell-handled screens (menu, mp-join, mp-lobby) ---

  if (shell.screen) return shell.screen;

  // --- Tournament ---

  if (shell.mode === "tournament") {
    if (matchHistoryPair) {
      return (
        <TournamentMatchHistory
          strategies={ALL_STRATEGIES.map((s) => ({ id: s.id, label: s.label }))}
          strategyAId={matchHistoryPair.aId}
          strategyBId={matchHistoryPair.bId}
          tournamentId={matchHistoryPair.tournamentId}
          onBack={() => setMatchHistoryPair(null)}
        />
      );
    }
    return (
      <div className="flex min-h-full flex-col p-4">
        <TournamentGrid
          gameSlug="sushi-go"
          strategies={ALL_STRATEGIES.map((s) => ({ id: s.id, label: s.label }))}
          onViewMatchHistory={(aId, bId, tournamentId) =>
            setMatchHistoryPair({ aId, bId, tournamentId })
          }
        />
      </div>
    );
  }

  // --- Solo setup ---

  if (shell.mode === "solo" && !shell.game.view) {
    return <SetupScreen onStart={handleSoloStart} />;
  }

  // --- Solo game over ---

  if (shell.mode === "solo" && shell.game.result) {
    if (showResults) {
      return (
        <GameOverScreen
          result={shell.game.result}
          myIndex={0}
          actionLog={lastViewRef.current?.actionLog ?? []}
          onMenu={() => {
            setShowResults(false);
            shell.goToMenu();
          }}
          onPlayAgain={() => {
            setShowResults(false);
            handleSoloStart(lastPlayerCount, lastStrategyId);
          }}
        />
      );
    }
    // Show board with final state until user clicks "See Results"
    const view = shell.game.view ?? lastViewRef.current;
    if (view) {
      return (
        <GameBoard
          view={view}
          myIndex={0}
          onAction={handleSoloAction}
          isGameOver
          onShowResults={() => setShowResults(true)}
        />
      );
    }
  }

  // --- Solo playing ---

  if (shell.mode === "solo" && shell.game.view) {
    return (
      <GameBoard
        view={shell.game.view}
        myIndex={0}
        onAction={handleSoloAction}
        isAiThinking={shell.game.isAiThinking}
      />
    );
  }

  // --- Multiplayer game over ---

  if (shell.mode === "mp-playing" && shell.mp.result) {
    if (showResults) {
      return (
        <GameOverScreen
          result={shell.mp.result}
          myIndex={shell.mp.playerIndex}
          actionLog={lastViewRef.current?.actionLog ?? []}
          onMenu={() => {
            setShowResults(false);
            shell.goToMenu();
          }}
        />
      );
    }
    const view = shell.mp.view ?? lastViewRef.current;
    if (view) {
      return (
        <GameBoard
          view={view}
          myIndex={shell.mp.playerIndex}
          onAction={handleMpAction}
          isGameOver
          onShowResults={() => setShowResults(true)}
        />
      );
    }
  }

  // --- Multiplayer playing ---

  if (shell.mode === "mp-playing" && shell.mp.view) {
    return (
      <GameBoard view={shell.mp.view} myIndex={shell.mp.playerIndex} onAction={handleMpAction} />
    );
  }

  return null;
}
