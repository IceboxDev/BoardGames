import { lazy } from "react";
import type { PlayableModule } from "../types";
import rulesUrl from "./assets/rules.pdf";

export default {
  component: lazy(() => import("./Duet")),
  extraMode: "campaign",
  rulesUrl,
  lobbyConfigComponent: lazy(() => import("./DuetLobbyConfig")),
  replayComponent: lazy(() => import("./components/DuetReplay")),
} satisfies PlayableModule;
