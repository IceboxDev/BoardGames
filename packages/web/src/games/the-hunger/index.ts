import { ALL_STRATEGIES } from "@boardgames/core/games/the-hunger/types";
import { lazy } from "react";
import type { PlayableModule } from "../types";

export default {
  component: lazy(() => import("./TheHunger")),
  mode: "remote",
  soloLabel: "Solo vs Vampires",
  hasMatchHistory: true,
  lobbyConfigComponent: lazy(() => import("./HungerLobbyConfig")),
  defaultMpConfig: { mode: "elder", beginnerSafeMountains: false },
  matchHistoryLabelResolver: (id: string) => ALL_STRATEGIES.find((s) => s.id === id)?.label ?? id,
} satisfies PlayableModule;
