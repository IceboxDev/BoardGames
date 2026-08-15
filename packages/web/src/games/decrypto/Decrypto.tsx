import type {
  DecryptoAction,
  DecryptoMachineEvent,
  DecryptoPlayerView,
  DecryptoResult,
} from "@boardgames/core/games/decrypto/types";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen, { type SoloMode } from "./components/SetupScreen";

interface SoloConfig {
  mode: SoloMode;
  modelId: string;
  timerEnabled: boolean;
}

function soloStartConfig({ mode, modelId, timerEnabled }: SoloConfig) {
  // `aiEngine` is redundant with aiModels but persistReplay sniffs that key
  // for the match-history "AI" column.
  return mode === "interceptor"
    ? {
        variant: "interceptor",
        humanPlayers: [2],
        aiModels: [modelId, modelId, null],
        aiEngine: modelId,
        timerEnabled,
      }
    : {
        variant: "standard",
        humanPlayers: [0],
        aiModels: [null, modelId, modelId, modelId],
        aiEngine: modelId,
        timerEnabled,
      };
}

export default function Decrypto({ source }: GameComponentProps) {
  const navigate = useNavigate();
  const { def, game, mp } = useGameShell<
    DecryptoPlayerView,
    DecryptoMachineEvent,
    DecryptoResult
  >();

  const [lastSolo, setLastSolo] = useState<SoloConfig | null>(null);
  const lastViewRef = useRef<DecryptoPlayerView | null>(null);
  if (game.view) lastViewRef.current = game.view;
  if (mp.view) lastViewRef.current = mp.view;

  const backToMenu = useCallback(() => {
    if (source === "mp") mp.reset();
    else game.reset();
    navigate(`/play/${def.slug}`);
  }, [source, mp.reset, game.reset, def.slug, navigate]);

  const handleSoloStart = useCallback(
    (mode: SoloMode, modelId: string, timerEnabled: boolean) => {
      const config: SoloConfig = { mode, modelId, timerEnabled };
      setLastSolo(config);
      game.start(soloStartConfig(config));
    },
    [game.start],
  );

  const mySoloSeat = lastSolo?.mode === "interceptor" ? 2 : 0;

  const handleSoloAction = useCallback(
    (action: DecryptoAction) => {
      game.send({ type: "PLAYER_ACTION", player: mySoloSeat, action });
    },
    [game.send, mySoloSeat],
  );

  const handleMpAction = useCallback(
    (action: DecryptoAction) => {
      // The server derives the seat from the authenticated socket; the raw
      // player field is ignored by validateAction in multiplayer.
      mp.send({ type: "PLAYER_ACTION", player: mp.playerIndex ?? 0, action });
    },
    [mp.send, mp.playerIndex],
  );

  // Seat display names: room slots mapped through seatOrder; solo has none
  // (the board labels AI seats by model and the local seat as "You").
  const mpNames: (string | null)[] = [];
  if (mp.roomState) {
    mp.roomState.slots.forEach((slot, i) => {
      const seat = mp.roomState?.seatOrder?.[i] ?? i;
      mpNames[seat] = slot.kind === "human" ? (slot.playerName ?? null) : null;
    });
  }

  if (source === "solo" && !game.view) {
    return <SetupScreen onStart={handleSoloStart} />;
  }

  if (source === "solo" && game.result) {
    const view = game.view ?? lastViewRef.current;
    if (view) {
      return (
        <GameOverScreen
          view={view}
          onMenu={backToMenu}
          onPlayAgain={lastSolo ? () => game.start(soloStartConfig(lastSolo)) : undefined}
        />
      );
    }
  }

  if (source === "solo" && game.view) {
    return (
      <GameBoard view={game.view} playerNames={[]} onAction={handleSoloAction} error={game.error} />
    );
  }

  if (source === "mp" && mp.result) {
    const view = mp.view ?? lastViewRef.current;
    if (view) return <GameOverScreen view={view} onMenu={backToMenu} />;
  }

  if (source === "mp" && mp.view) {
    return (
      <GameBoard view={mp.view} playerNames={mpNames} onAction={handleMpAction} error={mp.error} />
    );
  }

  return null;
}
