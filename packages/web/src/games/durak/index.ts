import { lazy } from "react";
import type { PlayableModule } from "../types";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";

export default {
  backgroundImage,
  component: lazy(() => import("./Durak")),
  mode: "remote",
  tournamentResults: () => import("./tournament-results.generated"),
  rulesUrl,
} satisfies PlayableModule;
