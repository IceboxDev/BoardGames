import { lazy } from "react";
import type { GameModule } from "../types";
import accent from "./accent.json";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";
import bgg from "./bgg.json";

export default {
  slug: "set",
  title: "Set",
  bggId: 1198,
  bgg,
  accentHex: accent.hex,
  backgroundImage,
  component: lazy(() => import("./SetGame")),
  mode: "remote",
  soloLabel: "Trainer",
  hasMatchHistory: true,
  rulesUrl,
} satisfies GameModule;
