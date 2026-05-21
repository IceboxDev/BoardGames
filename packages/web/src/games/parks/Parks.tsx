import type { ParksEvent } from "@boardgames/core/games/parks/machine";
import type {
  Action,
  AIStrategyId,
  ParksPlayerView,
  ParksResult,
} from "@boardgames/core/games/parks/types";
import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MpGameOverScreen } from "../../components/game-over";
import { useGameShell } from "../../hooks/useGameShell";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";

export default function Parks({ source }: GameComponentProps) {
  const navigate = useNavigate();
  const { def, game, mp } = useGameShell<ParksPlayerView, ParksEvent, ParksResult>();

  const backToMenu = useCallback(() => {
    if (source === "mp") mp.reset();
    else game.reset();
    navigate(`/play/${def.slug}`);
  }, [source, mp.reset, game.reset, def.slug, navigate]);

  // Auto-start solo on first entry — random AI is the only option, so
  // there's no setup screen to show. Mount → start → render board.
  // Back-to-menu unmounts the component so this won't loop.
  useEffect(() => {
    if (source === "solo" && !game.view && !game.result) {
      game.start({ strategies: [null, "random" as AIStrategyId] });
    }
  }, [source, game.view, game.result, game.start]);

  const handleAction = useCallback(
    (action: Action) => {
      if (source === "mp") {
        mp.send({ type: "PLAYER_ACTION", action } as ParksEvent);
      } else {
        game.send({ type: "PLAYER_ACTION", action } as ParksEvent);
      }
    },
    [source, game.send, mp.send],
  );

  const handlePlayAgain = useCallback(() => {
    game.start({ strategies: [null, "random" as AIStrategyId] });
  }, [game.start]);

  const active = source === "mp" ? mp : game;
  const activeView = active.view;
  const activeResult = active.result;
  const activePlayerIndex = active.playerIndex;
  const activeLegalActions = active.legalActions;
  const activeIsMyTurn = active.isMyTurn;
  const activeIsAiThinking = source === "mp" ? false : game.isAiThinking;

  if (!activeView) return null;

  if (activeResult) {
    if (source === "mp") {
      const isDraw = activeResult.isDraw;
      const isWinner = activeResult.winner === activePlayerIndex && !isDraw;
      return (
        <MpGameOverScreen
          headline={isDraw ? "Draw!" : isWinner ? "You Win!" : "You Lose"}
          headlineColor={isDraw ? "draw" : isWinner ? "win" : "lose"}
          subtitle={`Final scores: ${activeResult.scores.join(" vs ")}`}
          onBackToMenu={backToMenu}
        />
      );
    }
    return (
      <GameOverScreen
        view={activeView}
        result={activeResult}
        playerIndex={activePlayerIndex}
        onPlayAgain={handlePlayAgain}
        onBackToMenu={backToMenu}
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
