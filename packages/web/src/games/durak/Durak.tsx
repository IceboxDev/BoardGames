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
import { useGameShell } from "../../hooks/useGameShell";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

export default function Durak() {
  const shell = useGameShell<DurakPlayerView, DurakEvent, DurakResult>("durak");

  const [lastStrategy, setLastStrategy] = useState<AIStrategyId>("heuristic-v1");
  const [lastPlayerCount, setLastPlayerCount] = useState(2);

  // Back overrides for game-managed modes
  useEffect(() => {
    if (shell.mode === "match-history") {
      shell.setBackOverride(() => shell.goToMenu());
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
  }, [shell.mode, shell.game.view, shell.setBackOverride, shell.goToMenu, shell.game.reset]);

  const startGame = useCallback(
    (playerCount: number, strategy: AIStrategyId) => {
      setLastPlayerCount(playerCount);
      setLastStrategy(strategy);
      const strategies: (AIStrategyId | null)[] = [null];
      for (let i = 1; i < playerCount; i++) strategies.push(strategy);
      shell.game.start({ playerCount, strategies });
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
    const strategies: (AIStrategyId | null)[] = [null];
    for (let i = 1; i < lastPlayerCount; i++) strategies.push(lastStrategy);
    shell.game.start({ playerCount: lastPlayerCount, strategies });
  }, [lastPlayerCount, lastStrategy, shell.game.start]);

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

  // --- Solo setup ---

  if (shell.mode === "solo" && !shell.game.view) {
    return <SetupScreen onStart={startGame} />;
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
