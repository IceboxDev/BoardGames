import { lazy } from "react";
import type { PlayableModule } from "../types";
import backgroundImage from "./assets/img/background.png";
import rulesUrl from "./assets/img/rules.pdf";

export default {
  backgroundImage,
  component: lazy(() => import("./Pandemic")),
  mode: "remote",
  soloLabel: "Solo",
  rulesUrl,
  lobbyConfigComponent: lazy(() => import("./PandemicLobbyConfig")),
  defaultMpConfig: { difficulty: 4 },
} satisfies PlayableModule;
