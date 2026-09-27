import { lazy } from "react";
import type { PlayableModule } from "../types";

export default {
  component: lazy(() => import("./Decrypto")),
  mode: "remote",
  soloLabel: "Solo vs AI agents",
  lobbyConfigComponent: lazy(() => import("./DecryptoLobbyConfig")),
} satisfies PlayableModule;
