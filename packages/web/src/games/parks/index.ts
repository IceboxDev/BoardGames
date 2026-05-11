import { lazy } from "react";
import type { GameModule } from "../types";
import accent from "./accent.json";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";

export default {
  slug: "parks",
  bggId: 437306,
  accentHex: accent.hex,
  backgroundImage,
  rulesUrl,
  component: lazy(() => import("./Parks")),
  mode: "remote",
} satisfies GameModule;
