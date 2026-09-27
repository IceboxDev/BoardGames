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
  // The host picks the scenario in the lobby (defaults to the manifest's).
  lobbyConfigComponent: lazy(() => import("./SkyTeamLobbyConfig")),
  // The destination gallery needs the full viewport — render the lobby
  // like the solo SetupScreen (controls strip on top, gallery below).
  lobbyLayout: "wide",
} satisfies PlayableModule;
