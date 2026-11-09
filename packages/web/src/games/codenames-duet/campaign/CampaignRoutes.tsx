import { Navigate, Route, Routes, useParams } from "react-router-dom";
import CampaignList from "./CampaignList";
import CampaignMission from "./CampaignMission";
import MissionDesk from "./MissionDesk";
import { CAMPAIGN_BASE, COMPANION_BASE, type DeskMode } from "./paths";
import TableTracker from "./TableTracker";

// The campaign screens under `/play/codenames-duet/solo/*` (see `paths.ts`):
// Singleplayer's campaigns and missions against the AI partner, and the
// Companion's campaigns and live tracker for the physical game.

function DeskRoute({ mode }: { mode: DeskMode }) {
  const { id } = useParams<{ id: string }>();
  const base = mode === "table" ? COMPANION_BASE : CAMPAIGN_BASE;
  return id ? <MissionDesk id={id} mode={mode} /> : <Navigate to={base} replace />;
}

/** `solo/campaign/*`: a campaign's desk and its missions against the AI partner. */
export function PlayCampaignRoutes() {
  return (
    <Routes>
      <Route path=":id" element={<DeskRoute mode="play" />} />
      <Route path=":id/play/:city" element={<CampaignMission />} />
      <Route path="*" element={<Navigate to={CAMPAIGN_BASE} replace />} />
    </Routes>
  );
}

/** `solo/companion/*`: the table campaigns, their desks and the live tracker. */
export function CompanionRoutes() {
  return (
    <Routes>
      <Route index element={<CampaignList scope="table" />} />
      <Route path="free" element={<TableTracker campaignId={null} />} />
      <Route path=":id" element={<DeskRoute mode="table" />} />
      <Route path=":id/table/:city" element={<TableTrackerRoute />} />
      <Route path="*" element={<Navigate to={COMPANION_BASE} replace />} />
    </Routes>
  );
}

function TableTrackerRoute() {
  const { id } = useParams<{ id: string }>();
  return id ? <TableTracker campaignId={id} /> : <Navigate to={COMPANION_BASE} replace />;
}

export default function SoloCampaigns() {
  return <CampaignList scope="solo" />;
}
