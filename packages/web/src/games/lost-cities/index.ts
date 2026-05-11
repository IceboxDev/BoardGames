import { lazy } from "react";
import type { GameModule } from "../types";
import accent from "./accent.json";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";

export default {
  slug: "lost-cities",
  bggId: 50,
  accentHex: accent.hex,
  backgroundImage,
  component: lazy(() => import("./LostCities")),
  mode: "remote",
  hasMatchHistory: true,
  hasTournament: true,
  tournamentStrategies: [
    { id: "ismcts-v6", label: "Adaptive+" },
    { id: "ismcts-v5", label: "Adaptive" },
    { id: "ismcts-v4", label: "Strict" },
    { id: "ismcts-v1", label: "Baseline" },
  ],
  rulesUrl,
} satisfies GameModule;
