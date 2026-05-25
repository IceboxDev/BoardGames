import { lazy } from "react";
import type { PlayableModule } from "../types";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";

export default {
  backgroundImage,
  rulesUrl,
  component: lazy(() => import("./Parks")),
  mode: "remote",
  hasMatchHistory: true,
  // Button shown now; AI tournament strategies for Parks are coming later, so
  // the tournament route renders a "coming soon" placeholder until then.
  hasTournament: true,
} satisfies PlayableModule;
