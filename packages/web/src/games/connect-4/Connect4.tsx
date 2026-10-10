import { type Connect4Config, connect4Manifest } from "@boardgames/core/games/connect-4/manifest";
import type {
  Action,
  Connect4PlayerView,
  Connect4Result,
} from "@boardgames/core/games/connect-4/types";
import { useState } from "react";
import { BoardFallback } from "../../components/RouteFallback";
import { PvAISetupScreen } from "../../components/setup/PvAISetupScreen";
import { againstAi, type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import { ConfigControls } from "./components/ConfigControls";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";

interface Setup {
  strategy: string;
  config: Connect4Config;
}

const toSoloStart = ({ strategy, config }: Setup): SoloStart => ({
  seats: againstAi(2, strategy),
  config,
});

export default function Connect4({ source }: GameComponentProps) {
  const flow = useSessionFlow<Connect4PlayerView, Action, Connect4Result, Setup>(source, {
    toSoloStart,
  });
  const [config, setConfig] = useState<Connect4Config>(() => connect4Manifest.config.parse({}));

  if (flow.phase === "setup") {
    return (
      <PvAISetupScreen
        title="Connect 4"
        manifest={connect4Manifest}
        onStart={(_count, strategy) => flow.start({ strategy, config })}
        extraControls={
          <ConfigControls
            value={config}
            onChange={setConfig}
            openerLabels={{ seat0: "You", seat1: "AI" }}
          />
        }
      />
    );
  }
  if (!flow.view) return <BoardFallback />;

  if (flow.phase === "finished") {
    return (
      <GameOverScreen
        view={flow.view}
        outcome={flow.outcome}
        seat={flow.seat}
        names={flow.seatNames}
        actions={flow.endActions}
      />
    );
  }

  return (
    <GameBoard
      view={flow.view}
      legal={flow.legalActions}
      seat={flow.seat}
      names={flow.seatNames}
      isAiThinking={flow.isAiThinking}
      send={flow.sendAction}
    />
  );
}
