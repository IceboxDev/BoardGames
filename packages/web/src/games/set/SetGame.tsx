import type { PvpGameEvent, SetPvpPlayerView } from "@boardgames/core/games/set/pvp-machine";
import type { PvpGameResult } from "@boardgames/core/games/set/pvp-types";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import type { GameComponentProps } from "../types";
import PvpGameBoard from "./components/PvpGameBoard";
import PvpGameOverScreen from "./components/PvpGameOverScreen";
import TrainerGame from "./components/TrainerGame";

/**
 * Set has two distinct playable surfaces:
 *   - Solo "Trainer" — fully client-side speed practice with its own
 *     local match history (rendered by `<TrainerGame>`).
 *   - Multiplayer PvP — server-driven race-to-find-sets.
 *
 * The trainer's "View History" affordance navigates to the shared
 * `/play/set/match-history` route — the same URL the mode-picker
 * exposes. That route renders `<MatchHistory>` with the game's
 * `matchHistoryLabelResolver` from the registry.
 */
export default function SetGame({ source }: GameComponentProps) {
  const navigate = useNavigate();
  const { def, mp } = useGameShell<SetPvpPlayerView, PvpGameEvent, PvpGameResult | null>();

  const backToMenu = useCallback(() => {
    mp.reset();
    navigate(`/play/${def.slug}`);
  }, [mp.reset, def.slug, navigate]);

  if (source === "solo") {
    return <TrainerGame onViewHistory={() => navigate(`/play/${def.slug}/match-history`)} />;
  }

  // --- Multiplayer: game over ---

  if (mp.result) {
    const opponentIdx = 1 - mp.playerIndex;
    const opponentName =
      mp.roomState?.slots[opponentIdx]?.playerName ?? `Player ${opponentIdx + 1}`;
    return (
      <PvpGameOverScreen
        result={mp.result}
        playerIndex={mp.playerIndex}
        opponentName={opponentName}
        onBackToMenu={backToMenu}
      />
    );
  }

  // --- Multiplayer: active board ---

  if (mp.view) {
    const opponentIdx = 1 - mp.playerIndex;
    const opponentName =
      mp.roomState?.slots[opponentIdx]?.playerName ?? `Player ${opponentIdx + 1}`;
    return (
      <PvpGameBoard
        view={mp.view}
        playerIndex={mp.playerIndex}
        opponentName={opponentName}
        send={mp.send}
      />
    );
  }

  return null;
}
