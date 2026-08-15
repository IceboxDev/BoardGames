import { DECRYPTO_AI_MODELS } from "@boardgames/core/games/decrypto/ai/models";
import { lazy } from "react";
import type { PlayableModule } from "../types";

export default {
  component: lazy(() => import("./Decrypto")),
  mode: "remote",
  soloLabel: "Solo vs GPT agents",
  hasMatchHistory: true,
  matchHistoryLabelResolver: (id: string) =>
    DECRYPTO_AI_MODELS.find((m) => m.id === id)?.label ?? id,
  defaultMpConfig: { timerEnabled: false },
  lobbyConfigComponent: lazy(() => import("./DecryptoLobbyConfig")),
} satisfies PlayableModule;
