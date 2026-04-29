import { lazy } from "react";
import type { GameDefinition } from "../types";
import accent from "./accent.json";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "lost-cities",
  title: "Lost Cities",
  bggId: 50,
  bgg,
  thumbnail,
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
} satisfies GameDefinition;
