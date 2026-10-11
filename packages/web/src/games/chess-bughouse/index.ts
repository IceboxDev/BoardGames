import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import type { PlayableModule, ReplayProps } from "../types";
// Rules + credits (Fairy-Stockfish GPL-3.0). Source: assets/rules-source.html,
// printed to PDF with headless Chromium.
import rulesUrl from "./assets/rules.pdf";

const replayComponent = lazy(() => import("./components/GameReplay")) as LazyExoticComponent<
  ComponentType<ReplayProps>
>;

export default {
  component: lazy(() => import("./Bughouse")),
  rulesUrl,
  lobbyConfigComponent: lazy(() => import("./BughouseLobbyConfig")),
  replayComponent,
  tournamentResults: () => import("./tournament-results.generated"),
} satisfies PlayableModule;
