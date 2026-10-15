import { lazy } from "react";
import type { PlayableModule } from "../types";
import rulesUrl from "./assets/rules.pdf";

export default {
  component: lazy(() => import("./Pandemic")),
  extraMode: "companion",
  rulesUrl,
  lobbyConfigComponent: lazy(() => import("./PandemicLobbyConfig")),
} satisfies PlayableModule;
