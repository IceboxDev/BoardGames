import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import type { PlayableModule, ReplayProps } from "../types";

// `GameReplay` parses the stored log itself; the registry holds every game's
// replay component under the shared `unknown`-typed contract.
const replayComponent = lazy(() => import("./components/GameReplay")) as LazyExoticComponent<
  ComponentType<ReplayProps>
>;

export default {
  component: lazy(() => import("./Go")),
  mode: "remote",
  rulesUrl: [{ label: "How to play Go", url: "https://www.britgo.org/intro/intro2.html" }],
  replayComponent,
  lobbyConfigComponent: lazy(() => import("./GoLobbyConfig")),
  tournamentResults: () => import("./tournament-results.generated"),
} satisfies PlayableModule;
