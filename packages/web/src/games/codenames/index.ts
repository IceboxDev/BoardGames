import { lazy } from "react";
import type { PlayableModule } from "../types";
import rulesUrl from "./assets/rules.pdf";

export default {
  component: lazy(() => import("./Codenames")),
  rulesUrl,
  lobbyConfigComponent: lazy(() => import("./CodenamesLobbyConfig")),
  replayComponent: lazy(() => import("./components/CodenamesReplay")),
} satisfies PlayableModule;
