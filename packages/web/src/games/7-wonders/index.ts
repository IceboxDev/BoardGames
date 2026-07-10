import { lazy } from "react";
import type { PlayableModule } from "../types";

export default {
  component: lazy(() => import("./SevenWonders")),
  mode: "remote",
  soloLabel: "Play vs AI",
} satisfies PlayableModule;
