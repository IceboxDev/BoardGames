import type { SkyTeamConfig } from "@boardgames/core/games/sky-team/manifest";
import type {
  SkyTeamAction,
  SkyTeamPlayerView,
  SkyTeamResult,
  SlotId,
} from "@boardgames/core/games/sky-team/types";
import type { SeatRequest } from "@boardgames/core/machines/seats";
import { useCallback, useEffect, useState } from "react";
import { ActionLog } from "../../components/action-log";
import GameScreen from "../../components/game-layout/GameScreen";
import { BoardFallback } from "../../components/RouteFallback";
import { useGameShell } from "../../hooks/useGameShell";
import { type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import ApproachTrack from "./components/ApproachTrack";
import BriefingOverlay from "./components/BriefingOverlay";
import Cockpit from "./components/board/Cockpit";
import GameOverScreen from "./components/GameOverScreen";
import PhaseBanner from "./components/PhaseBanner";
import PlayerDiceTray from "./components/PlayerDiceTray";
import SetupScreen, { type SkyTeamSoloSetup } from "./components/SetupScreen";
import { mapSkyTeamLog } from "./log-mapper";

/** You fly the chosen seat; the AI partner takes the other. */
function toSoloStart({ scenarioId, seat, strategy }: SkyTeamSoloSetup): SoloStart {
  const ai: SeatRequest = { kind: "ai", strategy };
  const config: SkyTeamConfig = { scenarioId };
  return { seats: seat === 0 ? [{ kind: "human" }, ai] : [ai, { kind: "human" }], config };
}

export default function SkyTeam({ source }: GameComponentProps) {
  const flow = useSessionFlow<SkyTeamPlayerView, SkyTeamAction, SkyTeamResult, SkyTeamSoloSetup>(
    source,
    { toSoloStart },
  );
  // Room chat for the briefing lives on the room projection.
  const { mp } = useGameShell();

  const [selectedDieId, setSelectedDieId] = useState<number | null>(null);
  const [coffeeAdjust, setCoffeeAdjust] = useState(0);
  const [rerollMode, setRerollMode] = useState(false);
  const [rerollSelection, setRerollSelection] = useState<Set<number>>(new Set());

  const startSolo = useCallback(
    (setup: SkyTeamSoloSetup) => {
      setSelectedDieId(null);
      setCoffeeAdjust(0);
      setRerollMode(false);
      setRerollSelection(new Set());
      flow.start(setup);
    },
    [flow.start],
  );

  const view = flow.view;
  const { sendAction } = flow;

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

  const handleEndRound = useCallback(() => {
    sendAction({ kind: "end-round" });
  }, [sendAction]);

  const handleAcknowledgeGameOver = useCallback(() => {
    sendAction({ kind: "acknowledge-game-over" });
  }, [sendAction]);

  // The briefing phase exists so two humans can discuss strategy before the
  // dice roll. With an AI partner there's no one to discuss with — skip the
  // overlay and auto-confirm ready-to-roll so the round flows straight into
  // placement.
  useEffect(() => {
    if (source !== "solo") return;
    if (!view) return;
    if (view.phase !== "briefing") return;
    if (view.readyForRoll[view.viewerIndex]) return;
    sendAction({ kind: "ready-to-roll" });
  }, [source, view, sendAction]);

  const handleSpendReroll = useCallback(
    (ids: number[]) => {
      if (!view) return;
      sendAction({
        kind: "spend-reroll",
        pilotDieIds: view.viewerIndex === 0 ? ids : [],
        copilotDieIds: view.viewerIndex === 1 ? ids : [],
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

  if (flow.phase === "setup") return <SetupScreen onStart={startSolo} />;

  if (flow.phase === "finished" && flow.result) {
    return <GameOverScreen result={flow.result} actions={flow.endActions} />;
  }

  if (!view) return <BoardFallback />;

  // Seat names follow the room's seat order, so swapped roles are named right.
  const playerNames: [string, string] | undefined =
    source === "mp" ? [flow.seatNames[0] ?? "Pilot", flow.seatNames[1] ?? "Co-Pilot"] : undefined;

  return (
    <GameScreen
      background="bg-surface-950"
      sidebar={<ActionLog blocks={mapSkyTeamLog(view.log, playerNames)} />}
      leftSidebarLabel="Approach"
      leftSidebar={<ApproachTrack view={view} />}
      // Always render the dice tray — even during briefing — so the bottom
      // strip of the board stays the same height and the left/right sidebars
      // don't stretch to the floor when the player isn't placing yet. The
      // tray renders an empty centre column during briefing/rolling and
      // populates once myDice exists.
      fan={
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
      }
      fanActions={
        <PhaseBanner
          view={view}
          isAiThinking={flow.isAiThinking}
          onEndRound={view.canEndRound ? handleEndRound : undefined}
          onAcknowledgeGameOver={
            view.canAcknowledgeGameOver ? handleAcknowledgeGameOver : undefined
          }
        />
      }
    >
      {/* The cockpit stays mounted every phase — the briefing renders as a
          blurred overlay on top (portalled over #app-main) so the player never
          leaves the board. The wrapper centers the cockpit and gives it a
          defined height for its aspect-ratio to consume; without it, the
          flex-col content area would stretch the cockpit cross-axis (full
          width) and the aspect ratio would be ignored. */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Cockpit
          view={view}
          selectedDieId={selectedDieId}
          coffeeAdjust={coffeeAdjust}
          onSelectSlot={handleSelectSlot}
        />
      </div>
      {view.phase === "briefing" && source === "mp" && (
        <BriefingOverlay
          view={view}
          onReady={handleReady}
          chat={{
            messages: mp.chatMessages,
            onSend: mp.sendChat,
            mySlot: mp.mySlot ?? 0,
          }}
        />
      )}
    </GameScreen>
  );
}
