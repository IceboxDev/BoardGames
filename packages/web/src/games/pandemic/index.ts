import { lazy } from "react";
import type { GameModule } from "../types";
import accent from "./accent.json";
import backgroundImage from "./assets/img/background.png";
import rulesUrl from "./assets/img/rules.pdf";
import bgg from "./bgg.json";

export default {
  slug: "pandemic",
  title: "Pandemic",
  bggId: 30549,
  bgg,
  accentHex: accent.hex,
  backgroundImage,
  component: lazy(() => import("./Pandemic")),
  mode: "remote",
  soloLabel: "Solo",
  rulesUrl,
} satisfies GameModule;
