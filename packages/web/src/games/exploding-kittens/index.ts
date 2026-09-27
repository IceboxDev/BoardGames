import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import type { PlayableModule, ReplayProps } from "../types";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";

const replayComponent = lazy(() => import("./components/GameReplay")) as LazyExoticComponent<
  ComponentType<ReplayProps>
>;

export default {
  backgroundImage,
  component: lazy(() => import("./ExplodingKittens")),
  mode: "remote",
  rulesUrl,
  replayComponent,
  tournamentResults: () => import("./tournament-results.generated"),
} satisfies PlayableModule;
