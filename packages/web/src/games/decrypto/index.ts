import { DECRYPTO_AI_MODELS } from "@boardgames/core/games/decrypto/ai/models";
import { lazy } from "react";
import type { PlayableModule } from "../types";

export default {
  component: lazy(() => import("./Decrypto")),
  mode: "remote",
  soloLabel: "Solo vs GPT agents",
  hasMatchHistory: true,
  // Team game — p0/p1 are the SIDES, not "you vs opponent", so the generic
  // history table misreads every row. The bespoke view names the winning side.
  matchHistoryComponent: lazy(() => import("./components/DecryptoMatchHistory")),
  matchHistoryLabelResolver: (id: string) =>
    DECRYPTO_AI_MODELS.find((m) => m.id === id)?.label ?? id,
  defaultMpConfig: { timerEnabled: false },
  lobbyConfigComponent: lazy(() => import("./DecryptoLobbyConfig")),
} satisfies PlayableModule;
