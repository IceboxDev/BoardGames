import { lazy } from "react";
import type { PlayableModule } from "../types";

export default {
  component: lazy(() => import("./TheHunger")),
  mode: "remote",
  soloLabel: "Solo vs Vampires",
  lobbyConfigComponent: lazy(() => import("./HungerLobbyConfig")),
} satisfies PlayableModule;
