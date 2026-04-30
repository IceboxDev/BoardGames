import { lazy } from "react";
import type { GameModule } from "../types";
import accent from "./accent.json";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";
import bgg from "./bgg.json";

export default {
  slug: "parks",
  title: "Parks",
  bggId: 266524,
  bgg,
  accentHex: accent.hex,
  backgroundImage,
  rulesUrl,
  component: lazy(() => import("./Parks")),
  mode: "remote",
} satisfies GameModule;
