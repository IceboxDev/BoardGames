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
  // Button shown now; the co-op AI tournament (which strategy wins more) is
  // coming later, so there are no `tournamentStrategies` yet — the tournament
  // route renders a "coming soon" placeholder until they're added.
  hasTournament: true,
  // Stable scenario for the mp lobby. The lobby route reads this as
  // the initial config when the host clicks Start; no `lobbyConfigComponent`
  // because there's nothing for the user to pick.
  defaultMpConfig: { scenarioId: "yul-montreal" },
} satisfies PlayableModule;
