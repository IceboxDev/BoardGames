import type { SkyTeamMachineEvent } from "@boardgames/core/games/sky-team/machine";
import type {
  PlayerIndex,
  SkyTeamAction,
  SkyTeamPlayerView,
  SkyTeamResult,
  SlotId,
} from "@boardgames/core/games/sky-team/types";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActionLog } from "../../components/action-log";
import GameScreen from "../../components/game-layout/GameScreen";
import { MpGameOverScreen } from "../../components/game-over";
import { useGameShell } from "../../hooks/useGameShell";
import type { GameComponentProps } from "../types";
import ApproachTrack from "./components/ApproachTrack";
import BriefingOverlay from "./components/BriefingOverlay";
import Cockpit from "./components/board/Cockpit";
import GameOverScreen from "./components/GameOverScreen";
import PhaseBanner from "./components/PhaseBanner";
import PlayerDiceTray from "./components/PlayerDiceTray";
import SetupScreen, { type SkyTeamStartConfig } from "./components/SetupScreen";
import { mapSkyTeamLog } from "./log-mapper";

export default function SkyTeam({ source }: GameComponentProps) {
  const navigate = useNavigate();
  const { def, game, mp } = useGameShell<SkyTeamPlayerView, SkyTeamMachineEvent, SkyTeamResult>();

  const [selectedDieId, setSelectedDieId] = useState<number | null>(null);
  const [coffeeAdjust, setCoffeeAdjust] = useState(0);
  const [rerollMode, setRerollMode] = useState(false);
  const [rerollSelection, setRerollSelection] = useState<Set<number>>(new Set());
  const [lastConfig, setLastConfig] = useState<SkyTeamStartConfig | null>(null);

  const backToMenu = useCallback(() => {
    if (source === "mp") mp.reset();
    else game.reset();
    navigate(`/play/${def.slug}`);
  }, [source, mp.reset, game.reset, def.slug, navigate]);

  const startSolo = useCallback(
    (config: SkyTeamStartConfig) => {
      setLastConfig(config);
      setSelectedDieId(null);
      setCoffeeAdjust(0);
      setRerollMode(false);
      setRerollSelection(new Set());
      game.start(config);
    },
    [game.start],
  );

  const active = source === "mp" ? mp : game;
  const view = active.view;

  const sendAction = useCallback(
    (action: SkyTeamAction) => {
      if (!view) return;
      active.send({
        type: "PLAYER_ACTION",
        player: view.viewerIndex as PlayerIndex,
        action,
      });
    },
    [active.send, view],
  );

  const handleSelectSlot = useCallback(
    (slot: SlotId) => {
      if (selectedDieId == null) return;
      sendAction({
        kind: "place-die",
        dieId: selectedDieId,
        slot,
        coffeeAdjust,
      });
      setSelectedDieId(null);
      setCoffeeAdjust(0);
    },
    [selectedDieId, coffeeAdjust, sendAction],
  );

  const handleSelectDie = useCallback((id: number) => {
    setCoffeeAdjust(0);
    setSelectedDieId((prev) => (prev === id ? null : id));
  }, []);

  const handleAdjustCoffee = useCallback((delta: number) => {
    setCoffeeAdjust(delta);
  }, []);

  const handleReady = useCallback(() => {
    sendAction({ kind: "ready-to-roll" });
  }, [sendAction]);

  const handleSpendReroll = useCallback(
    (ids: number[]) => {
      if (!view) return;
      const myIdx = view.viewerIndex as PlayerIndex;
      sendAction({
        kind: "spend-reroll",
        pilotDieIds: myIdx === 0 ? ids : [],
        copilotDieIds: myIdx === 1 ? ids : [],
      });
      setRerollMode(false);
      setRerollSelection(new Set());
    },
    [sendAction, view],
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

  if (source === "solo" && !game.view && !game.result) {
    return <SetupScreen onStart={startSolo} />;
  }

  if (source === "solo" && game.result) {
    return (
      <GameOverScreen
        result={game.result}
        onPlayAgain={lastConfig ? () => startSolo(lastConfig) : undefined}
        onBackToMenu={backToMenu}
      />
    );
  }

  if (source === "mp" && mp.result) {
    const r = mp.result;
    const isWin = r.outcome === "win";
    return (
      <MpGameOverScreen
        headline={isWin ? "Smooth landing!" : "Crash!"}
        headlineColor={isWin ? "win" : "lose"}
        subtitle={r.outcome}
        onBackToMenu={backToMenu}
      />
    );
  }

  if (!view) return null;

  const playerNames: [string, string] | undefined =
    source === "mp" && mp.roomState
      ? [
          mp.roomState.slots[0]?.playerName ?? "Pilot",
          mp.roomState.slots[1]?.playerName ?? "Co-Pilot",
        ]
      : undefined;

  return (
    <GameScreen
      background="bg-slate-950"
      sidebar={<ActionLog blocks={mapSkyTeamLog(view.log, playerNames)} />}
      leftSidebar={<ApproachTrack view={view} />}
      leftSidebarTitle="Approach"
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
      fanActions={<PhaseBanner view={view} isAiThinking={active.isAiThinking} />}
    >
      {/* The cockpit stays mounted every phase — the briefing renders as a
          blurred overlay on top (portalled over #app-main) so the player never
          leaves the board. */}
      <Cockpit
        view={view}
        selectedDieId={selectedDieId}
        coffeeAdjust={coffeeAdjust}
        onSelectSlot={handleSelectSlot}
      />
      {view.phase === "briefing" && <BriefingOverlay view={view} onReady={handleReady} />}
    </GameScreen>
  );
}
