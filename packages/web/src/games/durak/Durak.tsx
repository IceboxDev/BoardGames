import { ALL_STRATEGIES } from "@boardgames/core/games/durak/ai-strategies";
import type { DurakEvent } from "@boardgames/core/games/durak/machine";
import type {
  Action,
  AIStrategyId,
  DurakPlayerView,
  DurakResult,
} from "@boardgames/core/games/durak/types";
import { AI_STRATEGY_LABELS } from "@boardgames/core/games/durak/types";
import { useCallback, useEffect, useState } from "react";
import { MpGameOverScreen } from "../../components/game-over";
import { MatchHistory } from "../../components/match-history";
import { TournamentGrid, TournamentMatchHistory } from "../../components/tournament";
import { useGameShell } from "../../hooks/useGameShell";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

export default function Durak() {
  const shell = useGameShell<DurakPlayerView, DurakEvent, DurakResult>("durak");

  const [lastStrategy, setLastStrategy] = useState<AIStrategyId>("heuristic-v1");
  const [matchHistoryPair, setMatchHistoryPair] = useState<{
    aId: string;
    bId: string;
    tournamentId: string;
  } | null>(null);

  // Back overrides for game-managed modes
  useEffect(() => {
    if (shell.mode === "match-history") {
      shell.setBackOverride(() => shell.goToMenu());
      return () => shell.setBackOverride(null);
    }
    if (shell.mode === "tournament") {
      if (matchHistoryPair) {
        shell.setBackOverride(() => setMatchHistoryPair(null));
      } else {
        shell.setBackOverride(() => shell.goToMenu());
      }
      return () => shell.setBackOverride(null);
    }
    if (shell.mode === "solo") {
      if (shell.game.view) {
        shell.setBackOverride(() => shell.game.reset());
      } else {
        shell.setBackOverride(() => shell.goToMenu());
      }
      return () => shell.setBackOverride(null);
    }
    if (shell.mode === "mp-playing") {
      shell.setBackOverride(shell.goToMenu);
      return () => shell.setBackOverride(null);
    }
    return undefined;
  }, [
    shell.mode,
    matchHistoryPair,
    shell.game.view,
    shell.setBackOverride,
    shell.goToMenu,
    shell.game.reset,
  ]);

  const startGame = useCallback(
    (strategy: AIStrategyId) => {
      setLastStrategy(strategy);
      shell.game.start({ playerCount: 2, strategies: [null, strategy] });
    },
    [shell.game.start],
  );

  const handleAction = useCallback(
    (action: Action) => {
      if (shell.mode === "mp-playing") {
        shell.mp.send({ type: "PLAYER_ACTION", action } as DurakEvent);
      } else {
        shell.game.send({ type: "PLAYER_ACTION", action } as DurakEvent);
      }
    },
    [shell.game.send, shell.mp.send, shell.mode],
  );

  const handlePlayAgain = useCallback(() => {
    shell.game.start({ playerCount: 2, strategies: [null, lastStrategy] });
  }, [lastStrategy, shell.game.start]);

  // --- Shell screens (mode select, join room, lobby) ---

  if (shell.screen) return shell.screen;

  // --- Match history ---

  if (shell.mode === "match-history") {
    return (
      <MatchHistory
        gameSlug="durak"
        labelResolver={(e) => AI_STRATEGY_LABELS[e as AIStrategyId] ?? e}
        onBack={shell.goToMenu}
      />
    );
  }

  // --- Tournament ---

  if (shell.mode === "tournament") {
    if (matchHistoryPair) {
      return (
        <TournamentMatchHistory
          strategies={ALL_STRATEGIES}
          strategyAId={matchHistoryPair.aId}
          strategyBId={matchHistoryPair.bId}
          tournamentId={matchHistoryPair.tournamentId}
          onBack={() => setMatchHistoryPair(null)}
        />
      );
    }
    return (
      <TournamentGrid
        gameSlug="durak"
        strategies={ALL_STRATEGIES}
        showScoreDiff={false}
        onViewMatchHistory={(aId, bId, tournamentId) =>
          setMatchHistoryPair({ aId, bId, tournamentId })
        }
      />
    );
  }

  // --- Solo setup ---

  if (shell.mode === "solo" && !shell.game.view) {
    return <SetupScreen onSelect={startGame} />;
  }

  // --- Active game (solo or MP) ---

  const activeView = shell.mode === "mp-playing" ? shell.mp.view : shell.game.view;
  const activeResult = shell.mode === "mp-playing" ? shell.mp.result : shell.game.result;
  const activePlayerIndex =
    shell.mode === "mp-playing" ? shell.mp.playerIndex : shell.game.playerIndex;
  const activeLegalActions =
    shell.mode === "mp-playing" ? shell.mp.legalActions : shell.game.legalActions;
  const activeIsMyTurn = shell.mode === "mp-playing" ? shell.mp.isMyTurn : shell.game.isMyTurn;
  const activeIsAiThinking = shell.mode === "mp-playing" ? false : shell.game.isAiThinking;

  if (!activeView) return null;

  if (activeResult) {
    if (shell.mode === "mp-playing") {
      const isDraw = activeResult.isDraw;
      const isLoser = activeResult.durak === activePlayerIndex;
      return (
        <MpGameOverScreen
          headline={isDraw ? "Draw!" : isLoser ? "You are the Durak!" : "You Win!"}
          headlineColor={isDraw ? "draw" : isLoser ? "lose" : "win"}
          subtitle={`Game lasted ${activeResult.turnCount} rounds`}
          onBackToMenu={shell.goToMenu}
        />
      );
    }

    return (
      <GameOverScreen
        view={activeView}
        playerIndex={activePlayerIndex}
        onPlayAgain={handlePlayAgain}
        onChangeSetup={() => shell.game.reset()}
      />
    );
  }

  return (
    <GameBoard
      view={activeView}
      legalActions={activeLegalActions as unknown as Action[]}
      playerIndex={activePlayerIndex}
      isMyTurn={activeIsMyTurn}
      isAiThinking={activeIsAiThinking}
      onAction={handleAction}
    />
  );
}
