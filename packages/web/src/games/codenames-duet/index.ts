import { lazy } from "react";
import type { PlayableModule } from "../types";

export default {
  component: lazy(() => import("./Duet")),
  mode: "remote",
  soloLabel: "With an AI partner",
  multiplayerDescription: "A room for two — each of you holds one side of the key.",
  lobbyConfigComponent: lazy(() => import("./DuetLobbyConfig")),
  replayComponent: lazy(() => import("./components/DuetReplay")),
} satisfies PlayableModule;
