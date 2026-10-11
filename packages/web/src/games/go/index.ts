import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import type { PlayableModule, ReplayProps } from "../types";
// Rules + credits (KataGo, MIT). Source: assets/rules-source.html, printed to
// PDF with headless Chromium.
import rulesUrl from "./assets/rules.pdf";

// `GameReplay` parses the stored log itself; the registry holds every game's
// replay component under the shared `unknown`-typed contract.
const replayComponent = lazy(() => import("./components/GameReplay")) as LazyExoticComponent<
  ComponentType<ReplayProps>
>;

export default {
  component: lazy(() => import("./Go")),
  rulesUrl,
  lobbyConfigComponent: lazy(() => import("./GoLobbyConfig")),
  replayComponent,
  tournamentResults: () => import("./tournament-results.generated"),
} satisfies PlayableModule;
