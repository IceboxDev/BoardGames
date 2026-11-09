import { Navigate, Route, Routes, useParams } from "react-router-dom";
import CampaignList from "./CampaignList";
import CampaignMission from "./CampaignMission";
import MissionDesk from "./MissionDesk";
import { CAMPAIGN_BASE } from "./paths";

// `/play/codenames-duet/solo/campaign/*`: the list, a campaign's Mission Desk,
// and a mission played against the AI partner.

function DeskRoute() {
  const { id } = useParams<{ id: string }>();
  return id ? <MissionDesk id={id} /> : <Navigate to={CAMPAIGN_BASE} replace />;
}

export default function CampaignRoutes() {
  return (
    <Routes>
      <Route index element={<CampaignList />} />
      <Route path=":id" element={<DeskRoute />} />
      <Route path=":id/play/:city" element={<CampaignMission />} />
      <Route path="*" element={<Navigate to={CAMPAIGN_BASE} replace />} />
    </Routes>
  );
}
