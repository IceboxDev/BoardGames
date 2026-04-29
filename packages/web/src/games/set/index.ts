import { lazy } from "react";
import type { GameDefinition } from "../types";
import accent from "./accent.json";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "set",
  title: "Set",
  bggId: 1198,
  bgg,
  thumbnail,
  accentHex: accent.hex,
  backgroundImage,
  component: lazy(() => import("./SetGame")),
  mode: "remote",
  soloLabel: "Trainer",
  hasMatchHistory: true,
  rulesUrl,
} satisfies GameDefinition;
