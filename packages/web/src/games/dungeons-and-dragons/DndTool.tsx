import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { LoadingState } from "../../components/ui";
import { useGameShell } from "../../hooks/useGameShell";
import { fetchCampaigns, partiesQueryFn } from "../../lib/dnd-campaigns";
import { qk } from "../../lib/query-keys";
import type { GameComponentProps } from "../types";
import { CampaignHall } from "./CampaignHall";
import { CampaignSetup } from "./CampaignSetup";
import { DndGameScreen } from "./DndGameScreen";
import { PartySetup } from "./PartySetup";

// The DM's side of the D&D entry, mounted under `/play/:slug/solo/*` (the
// route is a splat so the tool can host real sub-routes — the top nav's back
// button then unwinds screen by screen like everywhere else):
//
//   .                                        — the campaign hall (pick a world)
//   campaign/:campaignId                     — party picker (who's playing?)
//   campaign/:campaignId/party/:partyId      — party setup (roster)
//   campaign/:campaignId/party/:partyId/game — the running session
//
// The Cinzel display face is imported here so it rides this lazy chunk only.

const BG = "bg-gradient-to-b from-dnd-ink via-surface-950 to-black";

export default function DndTool(_props: GameComponentProps) {
  return (
    <Routes>
      <Route index element={<HallRoute />} />
      <Route path="campaign/:campaignId" element={<CampaignRoute />} />
      <Route path="campaign/:campaignId/party/:partyId" element={<PartyRoute screen="setup" />} />
      <Route
        path="campaign/:campaignId/party/:partyId/game"
        element={<PartyRoute screen="game" />}
      />
      {/* Unknown sub-paths (including intermediates the back button can
          produce, e.g. `.../party`) fall back to the nearest sensible screen. */}
      <Route path="campaign/:campaignId/*" element={<CampaignFallback />} />
      <Route path="*" element={<FallbackToHall />} />
    </Routes>
  );
}

function useHallPath(): string {
  const { def } = useGameShell();
  return `/play/${def.slug}/solo`;
}

function FallbackToHall() {
  return <Navigate to={useHallPath()} replace />;
}

/** `.../campaign/x/<junk>` → the campaign's party picker. */
function CampaignFallback() {
  const hallPath = useHallPath();
  const { campaignId } = useParams<{ campaignId: string }>();
  return <Navigate to={`${hallPath}/campaign/${campaignId}`} replace />;
}

function HallRoute() {
  const navigate = useNavigate();
  return (
    // The play-area Layout is fixed-height with overflow hidden, so each
    // scrolling screen owns its scroll container.
    <div className={`relative z-10 h-full overflow-y-auto ${BG}`}>
      <CampaignHall onOpenCampaign={(campaignId) => navigate(`campaign/${campaignId}`)} />
    </div>
  );
}

/** Resolve the campaign or bounce to the hall (deleted in another tab, …). */
function useCampaign(campaignId: string | undefined) {
  const campaignsQuery = useQuery({ queryKey: qk.dndCampaigns(), queryFn: fetchCampaigns });
  const campaign = campaignsQuery.data?.campaigns.find(
    (c) => c.id === campaignId && c.status === "ready",
  );
  return { campaign, pending: campaignsQuery.isPending };
}

function PendingScreen() {
  return (
    <div className={`relative z-10 flex h-full ${BG}`}>
      <LoadingState fill label="Opening the tome…" />
    </div>
  );
}

function CampaignRoute() {
  const hallPath = useHallPath();
  const navigate = useNavigate();
  const { campaignId } = useParams<{ campaignId: string }>();
  const { campaign, pending } = useCampaign(campaignId);

  const missing = !pending && !campaign;
  useEffect(() => {
    if (missing) navigate(hallPath, { replace: true });
  }, [missing, navigate, hallPath]);

  if (!campaign) return <PendingScreen />;
  return (
    <div className={`relative z-10 h-full overflow-y-auto ${BG}`}>
      <CampaignSetup
        campaign={campaign}
        onOpenParty={(partyId) => navigate(`party/${partyId}`)}
        onBurned={() => navigate(hallPath, { replace: true })}
      />
    </div>
  );
}

function PartyRoute({ screen }: { screen: "setup" | "game" }) {
  const hallPath = useHallPath();
  const navigate = useNavigate();
  const { campaignId, partyId } = useParams<{ campaignId: string; partyId: string }>();
  const { campaign, pending: campaignPending } = useCampaign(campaignId);

  const partiesQuery = useQuery({
    queryKey: qk.dndParties(campaignId ?? ""),
    queryFn: partiesQueryFn(campaignId ?? ""),
    enabled: !!campaignId,
  });
  const party = partiesQuery.data?.parties.find((p) => p.id === partyId);

  const missing = (!campaignPending && !campaign) || (!partiesQuery.isPending && !party);
  useEffect(() => {
    if (missing) {
      navigate(campaign ? `${hallPath}/campaign/${campaign.id}` : hallPath, { replace: true });
    }
  }, [missing, navigate, hallPath, campaign]);

  if (!campaign || !party) return <PendingScreen />;

  if (screen === "setup") {
    return (
      <div className={`relative z-10 h-full overflow-y-auto ${BG}`}>
        <PartySetup campaign={campaign} party={party} onStart={() => navigate("game")} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DndGameScreen campaign={campaign} party={party} />
    </div>
  );
}
