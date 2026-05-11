import type {
  PlayerIndex,
  SkyTeamAction,
  SkyTeamPlayerView,
  SkyTeamResult,
  SlotId,
} from "@boardgames/core/games/sky-team/types";
import { useCallback, useEffect, useState } from "react";
import { ActionLog } from "../../components/action-log";
import GameScreen from "../../components/game-layout/GameScreen";
import { MpGameOverScreen } from "../../components/game-over";
import { useGameShell } from "../../hooks/useGameShell";
import BriefingPanel from "./components/BriefingPanel";
import Cockpit from "./components/Cockpit";
import GameOverScreen from "./components/GameOverScreen";
import PhaseBanner from "./components/PhaseBanner";
import PlayerDiceTray from "./components/PlayerDiceTray";
import SetupScreen, { type SkyTeamStartConfig } from "./components/SetupScreen";
import { mapSkyTeamLog } from "./log-mapper";

export default function SkyTeam() {
  const shell = useGameShell<SkyTeamPlayerView, SkyTeamAction, SkyTeamResult>("sky-team", {
    getLobbyStartConfig: () => ({ scenarioId: "yul-montreal" }),
  });

  const [selectedDieId, setSelectedDieId] = useState<number | null>(null);
  const [coffeeAdjust, setCoffeeAdjust] = useState(0);
  const [rerollMode, setRerollMode] = useState(false);
  const [rerollSelection, setRerollSelection] = useState<Set<number>>(new Set());
  const [lastConfig, setLastConfig] = useState<SkyTeamStartConfig | null>(null);

  useEffect(() => {
    if (shell.mode === "solo") {
      shell.setBackOverride(() => shell.goToMenu());
      return () => shell.setBackOverride(null);
    }
    if (shell.mode === "mp-playing") {
      shell.setBackOverride(() => shell.goToMenu());
      return () => shell.setBackOverride(null);
    }
    shell.setBackOverride(null);
    return undefined;
  }, [shell.mode, shell.setBackOverride, shell.goToMenu]);

  const startSolo = useCallback(
    (config: SkyTeamStartConfig) => {
      setLastConfig(config);
      setSelectedDieId(null);
      setCoffeeAdjust(0);
      setRerollMode(false);
      setRerollSelection(new Set());
      shell.game.start(config);
    },
    [shell.game.start],
  );

  const activeGame = shell.mode === "mp-playing" ? shell.mp : shell.game;
  const view = activeGame.view;

  const handleSelectSlot = useCallback(
    (slot: SlotId) => {
      if (selectedDieId == null) return;
      activeGame.send({
        kind: "place-die",
        dieId: selectedDieId,
        slot,
        coffeeAdjust,
      } as SkyTeamAction);
      setSelectedDieId(null);
      setCoffeeAdjust(0);
    },
    [selectedDieId, coffeeAdjust, activeGame.send],
  );

  const handleSelectDie = useCallback((id: number) => {
    setCoffeeAdjust(0);
    setSelectedDieId((prev) => (prev === id ? null : id));
  }, []);

  const handleAdjustCoffee = useCallback((delta: number) => {
    setCoffeeAdjust(delta);
  }, []);

  const handleReady = useCallback(() => {
    activeGame.send({ kind: "ready-to-roll" } as SkyTeamAction);
  }, [activeGame.send]);

  const handleSpendReroll = useCallback(
    (ids: number[]) => {
      if (!view) return;
      const myIdx = view.viewerIndex as PlayerIndex;
      const action: SkyTeamAction = {
        kind: "spend-reroll",
        pilotDieIds: myIdx === 0 ? ids : [],
        copilotDieIds: myIdx === 1 ? ids : [],
      };
      activeGame.send(action);
      setRerollMode(false);
      setRerollSelection(new Set());
    },
    [activeGame.send, view],
  );

  const toggleRerollMode = useCallback(() => {
    setSelectedDieId(null);
    setCoffeeAdjust(0);
    setRerollMode((r) => !r);
    setRerollSelection(new Set());
  }, []);

  const toggleRerollDie = useCallback((id: number) => {
    setRerollSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (shell.screen) return shell.screen;

  if (shell.mode === "solo" && !shell.game.view && !shell.game.result) {
    return <SetupScreen onStart={startSolo} />;
  }

  if (shell.mode === "solo" && shell.game.result) {
    return (
      <GameOverScreen
        result={shell.game.result}
        onPlayAgain={lastConfig ? () => startSolo(lastConfig) : undefined}
        onBackToMenu={() => shell.goToMenu()}
      />
    );
  }

  if (shell.mode === "mp-playing" && shell.mp.result) {
    const r = shell.mp.result;
    const isWin = r.outcome === "win";
    return (
      <MpGameOverScreen
        headline={isWin ? "Smooth landing!" : "Crash!"}
        headlineColor={isWin ? "win" : "lose"}
        subtitle={r.outcome}
        onBackToMenu={() => shell.goToMenu()}
      />
    );
  }

  if (!view) return null;

  const playerNames: [string, string] | undefined =
    shell.mode === "mp-playing" && shell.mp.roomState
      ? [
          shell.mp.roomState.slots[0]?.playerName ?? "Pilot",
          shell.mp.roomState.slots[1]?.playerName ?? "Co-Pilot",
        ]
      : undefined;

  return (
    <GameScreen
      background="bg-slate-950"
      sidebar={<ActionLog blocks={mapSkyTeamLog(view.log, playerNames)} />}
      fan={
        view.phase === "placement" ? (
          <PlayerDiceTray
            view={view}
            selectedDieId={selectedDieId}
            coffeeAdjust={coffeeAdjust}
            onSelectDie={handleSelectDie}
            onAdjustCoffee={handleAdjustCoffee}
            onSpendReroll={handleSpendReroll}
            rerollMode={rerollMode}
            rerollSelection={rerollSelection}
            onToggleRerollMode={toggleRerollMode}
            onToggleRerollDie={toggleRerollDie}
          />
        ) : undefined
      }
      fanActions={<PhaseBanner view={view} isAiThinking={activeGame.isAiThinking} />}
    >
      {view.phase === "briefing" ? (
        <BriefingPanel view={view} onReady={handleReady} />
      ) : (
        <Cockpit
          view={view}
          selectedDieId={selectedDieId}
          coffeeAdjust={coffeeAdjust}
          onSelectSlot={handleSelectSlot}
        />
      )}
    </GameScreen>
  );
}
