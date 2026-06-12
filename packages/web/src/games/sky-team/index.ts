import { lazy } from "react";
import type { PlayableModule } from "../types";
import backgroundImage from "./assets/background.png";
import flightLogUrl from "./assets/flight-log.pdf";
import baseRulesUrl from "./assets/rules.pdf";

export default {
  backgroundImage,
  component: lazy(() => import("./SkyTeam")),
  mode: "remote",
  soloLabel: "Solo vs Co-pilot AI",
  // Sky Team ships two booklets — the base rules ("Landing Procedure") and
  // the advanced scenarios book ("Flight Log") — so the viewer renders a
  // tab bar instead of a single PDF.
  rulesUrl: [
    { label: "Rules", url: baseRulesUrl },
    { label: "Flight Log", url: flightLogUrl },
  ],
  hasMatchHistory: true,
  // Sky Team is fully co-op — pilot and co-pilot share the win/loss so
  // "Opponent" in the match-history table reads wrong. The AI fills the
  // co-pilot seat (or vice-versa) when you play solo; that's what the
  // column should announce.
  matchHistoryOpponentLabel: "AI Co-pilot",
  // Button shown now; the co-op AI tournament (which strategy wins more) is
  // coming later, so there are no `tournamentStrategies` yet — the tournament
  // route renders a "coming soon" placeholder until they're added.
  hasTournament: true,
  // Stable scenario for the mp lobby. Seeds the lobby config; the host
  // can override it via `lobbyConfigComponent` (the scenario picker).
  defaultMpConfig: { scenarioId: "yul-montreal" },
  lobbyConfigComponent: lazy(() => import("./SkyTeamLobbyConfig")),
  // The destination gallery needs the full viewport — render the lobby
  // like the solo SetupScreen (controls strip on top, gallery below).
  lobbyLayout: "wide",
} satisfies PlayableModule;
