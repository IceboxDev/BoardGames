import { lazy } from "react";
import type { GameModule } from "../types";
import accent from "./accent.json";
import backgroundImage from "./assets/img/background.png";
import rulesUrl from "./assets/img/rules.pdf";

export default {
  slug: "pandemic",
  bggId: 30549,
  accentHex: accent.hex,
  backgroundImage,
  component: lazy(() => import("./Pandemic")),
  mode: "remote",
  soloLabel: "Solo",
  rulesUrl,
  lobbyConfigComponent: lazy(() => import("./PandemicLobbyConfig")),
  defaultMpConfig: { difficulty: 4 },
} satisfies GameModule;
