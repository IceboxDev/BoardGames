import { lazy } from "react";
import type { PlayableModule } from "../types";
import rulesUrl from "./assets/rules.pdf";

export default {
  component: lazy(() => import("./Decrypto")),
  rulesUrl,
  lobbyConfigComponent: lazy(() => import("./DecryptoLobbyConfig")),
} satisfies PlayableModule;
