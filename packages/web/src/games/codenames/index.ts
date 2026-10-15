import { lazy } from "react";
import type { PlayableModule } from "../types";
import rulesUrl from "./assets/rules.pdf";

export default {
  component: lazy(() => import("./Codenames")),
  extraMode: "companion",
  rulesUrl,
  lobbyConfigComponent: lazy(() => import("./CodenamesLobbyConfig")),
  // Seats two apart are one team's: rotating by 2 makes each team's next operative its spymaster.
  rematchRotations: [{ label: "Rotate spymasters", by: 2 }],
  replayComponent: lazy(() => import("./components/CodenamesReplay")),
} satisfies PlayableModule;
