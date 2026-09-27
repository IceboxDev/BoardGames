import type { DecryptoConfig } from "@boardgames/core/games/decrypto/manifest";
import type {
  DecryptoAction,
  DecryptoPlayerView,
  DecryptoResult,
} from "@boardgames/core/games/decrypto/types";
import type { SeatRequest } from "@boardgames/core/machines/seats";
import { BoardFallback } from "../../components/RouteFallback";
import { type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen, { type SoloMode } from "./components/SetupScreen";

interface DecryptoSetup {
  mode: SoloMode;
  modelId: string;
  timerEnabled: boolean;
}

/**
 * Standard: you (White 1) with an AI teammate against an AI team. Interceptor:
 * a two-AI team transmits and you intercept from seat 2.
 */
function toSoloStart({ mode, modelId, timerEnabled }: DecryptoSetup): SoloStart {
  const ai: SeatRequest = { kind: "ai", strategy: modelId };
  const config: DecryptoConfig = { timerEnabled };
  return mode === "interceptor"
    ? { seats: [ai, ai, { kind: "human" }], config }
    : { seats: [{ kind: "human" }, ai, ai, ai], config };
}

export default function Decrypto({ source }: GameComponentProps) {
  const flow = useSessionFlow<DecryptoPlayerView, DecryptoAction, DecryptoResult, DecryptoSetup>(
    source,
    { toSoloStart },
  );

  if (flow.phase === "setup") {
    return (
      <SetupScreen
        onStart={(mode, modelId, timerEnabled) => flow.start({ mode, modelId, timerEnabled })}
      />
    );
  }
  if (!flow.view) return <BoardFallback />;

  if (flow.phase === "finished") {
    return <GameOverScreen view={flow.view} actions={flow.endActions} />;
  }

  // Room players by name; AI seats (and solo) are labelled by model / "You".
  const playerNames = flow.seats.map((s) =>
    source === "mp" && s.kind === "human" ? s.name : null,
  );
  return (
    <GameBoard
      view={flow.view}
      playerNames={playerNames}
      onAction={flow.sendAction}
      error={flow.error}
    />
  );
}
