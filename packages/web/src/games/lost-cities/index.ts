import { type ComponentType, type LazyExoticComponent, lazy } from "react";
import type { PlayableModule, ReplayProps } from "../types";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";

// `GameReplay` is typed against `LostCitiesReplayLog` internally; the
// shared `ReplayProps` contract types `game` as `unknown` so the
// registry can hold replay components for every game's log shape under
// one type. Casting at the lazy() boundary keeps the per-game
// component free of `unknown` plumbing while making the registry
// uniformly typed.
const replayComponent = lazy(() => import("./components/GameReplay")) as LazyExoticComponent<
  ComponentType<ReplayProps>
>;

export default {
  backgroundImage,
  component: lazy(() => import("./LostCities")),
  mode: "remote",
  rulesUrl,
  replayComponent,
  tournamentResults: () => import("./tournament-results.generated"),
} satisfies PlayableModule;
