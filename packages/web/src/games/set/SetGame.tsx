import type { PvpGameEvent, SetPvpPlayerView } from "@boardgames/core/games/set/pvp-machine";
import type { PvpGameResult } from "@boardgames/core/games/set/pvp-types";
import { useCallback, useEffect, useState } from "react";
import { MatchHistory } from "../../components/match-history";
import { useGameShell } from "../../hooks/useGameShell";
import HighScores from "./components/HighScores";
import PvpGameBoard from "./components/PvpGameBoard";
import PvpGameOverScreen from "./components/PvpGameOverScreen";
import TrainerGame from "./components/TrainerGame";
import { useSetHistory } from "./hooks/useSetHistory";

type HistoryTab = "trainer" | "pvp";

export default function SetGame() {
  const shell = useGameShell<SetPvpPlayerView, PvpGameEvent, PvpGameResult | null>("set");

  const [showHistory, setShowHistory] = useState(false);
  const [historyTab, setHistoryTab] = useState<HistoryTab>("trainer");
  const { history: trainerHistory, clear: clearTrainer } = useSetHistory();

  const goBackFromHistory = useCallback(() => setShowHistory(false), []);

  // Back overrides for game-managed modes
  useEffect(() => {
    if (showHistory) {
      shell.setBackOverride(goBackFromHistory);
      return () => shell.setBackOverride(null);
    }
    if (shell.mode === "solo" || shell.mode === "mp-playing" || shell.mode === "match-history") {
      shell.setBackOverride(shell.goToMenu);
      return () => shell.setBackOverride(null);
    }
    return undefined;
  }, [showHistory, shell.mode, shell.goToMenu, shell.setBackOverride, goBackFromHistory]);

  // Shell screens (menu, join room, lobby)
  if (shell.screen) return shell.screen;

  // --- Match History (from trainer "View History" or from mode picker) ---

  if (showHistory || shell.mode === "match-history") {
    const onBack = showHistory ? goBackFromHistory : shell.goToMenu;
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Match History</h2>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white transition hover:bg-gray-600"
          >
            Back
          </button>
        </div>

        <div className="mb-6 flex gap-1 border-b border-gray-800 pb-px">
          <button
            type="button"
            onClick={() => setHistoryTab("trainer")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              historyTab === "trainer"
                ? "border-indigo-500 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            Trainer
          </button>
          <button
            type="button"
            onClick={() => setHistoryTab("pvp")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              historyTab === "pvp"
                ? "border-indigo-500 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            PvP
          </button>
        </div>

        {historyTab === "trainer" ? (
          <HighScores history={trainerHistory} onClear={clearTrainer} onBack={onBack} />
        ) : (
          <MatchHistory gameSlug="set" labelResolver={() => "Human"} onBack={onBack} />
        )}
      </div>
    );
  }

  // --- Trainer (solo mode) — fully client-side ---

  if (shell.mode === "solo") {
    return <TrainerGame onViewHistory={() => setShowHistory(true)} />;
  }

  // --- Multiplayer: Game over ---

  if (shell.mode === "mp-playing" && shell.mp.result) {
    const opponentIdx = 1 - shell.mp.playerIndex;
    const opponentName =
      shell.mp.roomState?.slots[opponentIdx]?.playerName ?? `Player ${opponentIdx + 1}`;

    return (
      <PvpGameOverScreen
        result={shell.mp.result}
        playerIndex={shell.mp.playerIndex}
        opponentName={opponentName}
        onBackToMenu={shell.goToMenu}
      />
    );
  }

  // --- Multiplayer: Active game ---

  if (shell.mode === "mp-playing" && shell.mp.view) {
    const opponentIdx = 1 - shell.mp.playerIndex;
    const opponentName =
      shell.mp.roomState?.slots[opponentIdx]?.playerName ?? `Player ${opponentIdx + 1}`;

    return (
      <PvpGameBoard
        view={shell.mp.view}
        playerIndex={shell.mp.playerIndex}
        opponentName={opponentName}
        send={shell.mp.send}
      />
    );
  }

  return null;
}
