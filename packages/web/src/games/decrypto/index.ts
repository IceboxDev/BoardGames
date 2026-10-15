import { lazy } from "react";
import type { PlayableModule } from "../types";
import rulesUrl from "./assets/rules.pdf";

export default {
  component: lazy(() => import("./Decrypto")),
  extraMode: "companion",
  rulesUrl,
  lobbyConfigComponent: lazy(() => import("./DecryptoLobbyConfig")),
} satisfies PlayableModule;
