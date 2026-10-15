import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import type { PlayableModule, ReplayProps } from "../types";
import rulesUrl from "./assets/rules.pdf";

const replayComponent = lazy(() => import("./components/GameReplay")) as LazyExoticComponent<
  ComponentType<ReplayProps>
>;

export default {
  component: lazy(() => import("./Senso")),
  extraMode: "coach",
  rulesUrl,
  replayComponent,
  tournamentResults: () => import("./tournament-results.generated"),
} satisfies PlayableModule;
