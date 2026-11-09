import { CODENAMES_AI_MODELS } from "@boardgames/core/games/codenames/ai/models";
import { CityIdSchema } from "@boardgames/core/games/codenames-duet/campaign/map";
import type {
  DuetAction,
  DuetPlayerView,
  DuetResult,
} from "@boardgames/core/games/codenames-duet/types";
import { useCallback } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { type SoloStart, useSessionFlow } from "../../../hooks/useSessionFlow";
import type { DuetSetup } from "../components/SetupScreen";
import { DuetTable } from "../Duet";
import { CAMPAIGN_BASE, campaignPath } from "./paths";

// A campaign mission against the AI partner: no setup screen — the server
// checks the campaign and fills in the city's turns and mistakes
// (`prepareConfig`); a refusal (a locked city, not your campaign) shows as the
// session's error.

export default function CampaignMission() {
  const { id, city } = useParams<{ id: string; city: string }>();
  const [search] = useSearchParams();
  const parsedCity = CityIdSchema.safeParse(city);
  const ai = search.get("ai");
  const tier = CODENAMES_AI_MODELS.find((m) => m.id === ai)?.id ?? CODENAMES_AI_MODELS[2].id;
  if (!id) return <Navigate to={CAMPAIGN_BASE} replace />;
  if (!parsedCity.success) return <Navigate to={campaignPath(id)} replace />;
  return <Mission id={id} city={parsedCity.data} tier={tier} />;
}

function Mission({ id, city, tier }: { id: string; city: string; tier: string }) {
  const autoStart = useCallback(
    (): SoloStart => ({
      seats: [{ kind: "human" }, { kind: "ai", strategy: tier }],
      config: { campaign: { id, city } },
    }),
    [id, city, tier],
  );
  const flow = useSessionFlow<DuetPlayerView, DuetAction, DuetResult, DuetSetup>("solo", {
    autoStart,
  });
  if (flow.error && !flow.view) {
    return <Navigate to={campaignPath(id)} replace state={{ missionError: flow.error }} />;
  }
  return <DuetTable flow={flow} source="solo" />;
}
