import type { DurakEvent } from "@boardgames/core/games/durak/machine";
import type {
  Action,
  AIStrategyId,
  DurakPlayerView,
  DurakResult,
} from "@boardgames/core/games/durak/types";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MpGameOverScreen } from "../../components/game-over";
import { useGameShell } from "../../hooks/useGameShell";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

export default function Durak({ source }: GameComponentProps) {
  const navigate = useNavigate();
  const { def, game, mp } = useGameShell<DurakPlayerView, DurakEvent, DurakResult>();

  const [lastStrategy, setLastStrategy] = useState<AIStrategyId>("heuristic-v1");
  const [lastPlayerCount, setLastPlayerCount] = useState(2);

  const backToMenu = useCallback(() => {
    if (source === "mp") mp.reset();
    else game.reset();
    navigate(`/play/${def.slug}`);
  }, [source, mp.reset, game.reset, def.slug, navigate]);

  const startGame = useCallback(
    (playerCount: number, strategy: AIStrategyId) => {
      setLastPlayerCount(playerCount);
      setLastStrategy(strategy);
      const strategies: (AIStrategyId | null)[] = [null];
      for (let i = 1; i < playerCount; i++) strategies.push(strategy);
      game.start({ playerCount, strategies });
    },
    [game.start],
  );

  const handleAction = useCallback(
    (action: Action) => {
      if (source === "mp") {
        mp.send({ type: "PLAYER_ACTION", action } as DurakEvent);
      } else {
        game.send({ type: "PLAYER_ACTION", action } as DurakEvent);
      }
    },
    [source, game.send, mp.send],
  );

  const handlePlayAgain = useCallback(() => {
    const strategies: (AIStrategyId | null)[] = [null];
    for (let i = 1; i < lastPlayerCount; i++) strategies.push(lastStrategy);
    game.start({ playerCount: lastPlayerCount, strategies });
  }, [lastPlayerCount, lastStrategy, game.start]);

  // --- Solo setup ---

  if (source === "solo" && !game.view) {
    return <SetupScreen onStart={startGame} />;
  }

  // --- Active game (solo or mp) ---

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
      const isLoser = activeResult.durak === activePlayerIndex;
      return (
        <MpGameOverScreen
          headline={isDraw ? "Draw!" : isLoser ? "You are the Durak!" : "You Win!"}
          headlineColor={isDraw ? "draw" : isLoser ? "lose" : "win"}
          subtitle={`Game lasted ${activeResult.turnCount} rounds`}
          onBackToMenu={backToMenu}
        />
      );
    }

    return (
      <GameOverScreen
        view={activeView}
        playerIndex={activePlayerIndex}
        onPlayAgain={handlePlayAgain}
        onChangeSetup={() => game.reset()}
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
