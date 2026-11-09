import type { DuetConfig } from "@boardgames/core/games/codenames-duet/manifest";
import type {
  DuetAction,
  DuetPlayerView,
  DuetResult,
} from "@boardgames/core/games/codenames-duet/types";
import { lazy, type ReactNode, Suspense } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import type { GameOverAction } from "../../components/game-over";
import { BoardFallback, RouteFallback } from "../../components/RouteFallback";
import { type SessionFlow, type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import { CAMPAIGN_BASE, campaignPath } from "./campaign/paths";
import { useMissionOutcome } from "./campaign/useMissionOutcome";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen, { type DuetSetup } from "./components/SetupScreen";

const SoloCampaigns = lazy(() => import("./campaign/CampaignRoutes"));
const PlayCampaignRoutes = lazy(() =>
  import("./campaign/CampaignRoutes").then((m) => ({ default: m.PlayCampaignRoutes })),
);
const CompanionRoutes = lazy(() =>
  import("./campaign/CampaignRoutes").then((m) => ({ default: m.CompanionRoutes })),
);

const lazyRoute = (element: ReactNode) => (
  <Suspense fallback={<RouteFallback />}>{element}</Suspense>
);

function toSoloStart({ modelId, ...options }: DuetSetup): SoloStart {
  const config: DuetConfig = options;
  return { seats: [{ kind: "human" }, { kind: "ai", strategy: modelId }], config };
}

// Singleplayer is the campaign (`solo`: your campaigns with the AI partner),
// a quick game outside it is `solo/free`, and the Companion — the live tracker
// for the physical game — is `solo/companion` (`campaign/paths.ts`).
export default function Duet({ source }: GameComponentProps) {
  if (source !== "solo") return <DuetGame source={source} />;
  return (
    <Routes>
      <Route index element={lazyRoute(<SoloCampaigns />)} />
      <Route path="free" element={<DuetGame source="solo" />} />
      <Route path="campaign/*" element={lazyRoute(<PlayCampaignRoutes />)} />
      <Route path="companion/*" element={lazyRoute(<CompanionRoutes />)} />
      <Route path="*" element={<Navigate to={CAMPAIGN_BASE} replace />} />
    </Routes>
  );
}

function DuetGame({ source }: GameComponentProps) {
  const flow = useSessionFlow<DuetPlayerView, DuetAction, DuetResult, DuetSetup>(source, {
    toSoloStart,
  });
  if (flow.phase === "setup") return <SetupScreen onStart={flow.start} />;
  return <DuetTable flow={flow} source={source} />;
}

/**
 * The board, then the debrief — for a plain game and a campaign mission alike.
 * A mission adds its outcome on the map and a way back to the campaign.
 */
export function DuetTable({
  flow,
  source,
}: {
  flow: SessionFlow<DuetPlayerView, DuetAction, DuetResult, DuetSetup>;
  source: GameComponentProps["source"];
}) {
  const navigate = useNavigate();
  const mission = flow.view?.campaign ?? null;
  const outcome = useMissionOutcome(mission);
  if (!flow.view) return <BoardFallback />;
  const names = flow.seats.map((s) => (source === "mp" && s.kind === "human" ? s.name : null));
  if (flow.phase === "finished") {
    const actions: GameOverAction[] = mission
      ? [
          {
            label: "Back to the campaign",
            variant: "primary",
            onClick: () => navigate(campaignPath(mission.id)),
          },
          ...flow.endActions
            .filter((a) => a.label !== "Back to Menu")
            .map((a) => ({ ...a, variant: "secondary" as const })),
        ]
      : [...flow.endActions];
    return (
      <GameOverScreen
        view={flow.view}
        names={names}
        actions={actions}
        campaignLine={outcome(flow.view.result)}
      />
    );
  }
  return <GameBoard view={flow.view} names={names} onAction={flow.sendAction} error={flow.error} />;
}
