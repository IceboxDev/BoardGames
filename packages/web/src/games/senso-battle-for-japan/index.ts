import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import type { PlayableModule, ReplayProps } from "../types";

const replayComponent = lazy(() => import("./components/GameReplay")) as LazyExoticComponent<
  ComponentType<ReplayProps>
>;

export default {
  component: lazy(() => import("./Senso")),
  mode: "remote",
  soloLabel: "Solo vs clan AI",
  replayComponent,
  tournamentResults: () => import("./tournament-results.generated"),
} satisfies PlayableModule;
