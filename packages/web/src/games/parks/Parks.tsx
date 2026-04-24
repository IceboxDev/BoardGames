import type { ParksEvent } from "@boardgames/core/games/parks/machine";
import type {
  Action,
  AIStrategyId,
  ParksPlayerView,
  ParksResult,
} from "@boardgames/core/games/parks/types";
import { useCallback, useEffect } from "react";
import { MpGameOverScreen } from "../../components/game-over";
import { useGameShell } from "../../hooks/useGameShell";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";

export default function Parks() {
  const shell = useGameShell<ParksPlayerView, ParksEvent, ParksResult>("parks");

  // Back overrides for game-managed modes — always exit to menu (no setup screen).
  useEffect(() => {
    if (shell.mode === "solo" || shell.mode === "mp-playing") {
      shell.setBackOverride(shell.goToMenu);
      return () => shell.setBackOverride(null);
    }
    return undefined;
  }, [shell.mode, shell.setBackOverride, shell.goToMenu]);

  // Auto-start solo on first entry (no setup screen — random AI is the only option).
  // We only kick off when there's no view yet AND no result; back-to-menu unmounts
  // the component so this won't loop.
  useEffect(() => {
    if (shell.mode === "solo" && !shell.game.view && !shell.game.result) {
      shell.game.start({ strategies: [null, "random" as AIStrategyId] });
    }
  }, [shell.mode, shell.game.view, shell.game.result, shell.game.start]);

  const handleAction = useCallback(
    (action: Action) => {
      if (shell.mode === "mp-playing") {
        shell.mp.send({ type: "PLAYER_ACTION", action } as ParksEvent);
      } else {
        shell.game.send({ type: "PLAYER_ACTION", action } as ParksEvent);
      }
    },
    [shell.game.send, shell.mp.send, shell.mode],
  );

  const handlePlayAgain = useCallback(() => {
    shell.game.start({ strategies: [null, "random" as AIStrategyId] });
  }, [shell.game.start]);

  // Shell screens (mode select, join room, lobby)
  if (shell.screen) return shell.screen;

  // Active game
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
      const isWinner = activeResult.winner === activePlayerIndex && !isDraw;
      return (
        <MpGameOverScreen
          headline={isDraw ? "Draw!" : isWinner ? "You Win!" : "You Lose"}
          headlineColor={isDraw ? "draw" : isWinner ? "win" : "lose"}
          subtitle={`Final scores: ${activeResult.scores.join(" vs ")}`}
          onBackToMenu={shell.goToMenu}
        />
      );
    }
    return (
      <GameOverScreen
        view={activeView}
        result={activeResult}
        playerIndex={activePlayerIndex}
        onPlayAgain={handlePlayAgain}
        onBackToMenu={shell.goToMenu}
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
