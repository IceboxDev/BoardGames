import { lazy } from "react";
import type { PlayableModule } from "../types";
import rulesUrl from "./assets/rules.pdf";

export default {
  component: lazy(() => import("./Duet")),
  // Singleplayer and Multiplayer play the campaign; the Companion tracks a
  // game played with the physical cards (`campaign/paths.ts`).
  extraMode: "companion",
  extraModePath: "solo/companion",
  rulesUrl,
  lobbyConfigComponent: lazy(() => import("./DuetLobbyConfig")),
  replayComponent: lazy(() => import("./components/DuetReplay")),
} satisfies PlayableModule;
