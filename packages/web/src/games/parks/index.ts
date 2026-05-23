import { lazy } from "react";
import type { PlayableModule } from "../types";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";

export default {
  backgroundImage,
  rulesUrl,
  component: lazy(() => import("./Parks")),
  mode: "remote",
} satisfies PlayableModule;
