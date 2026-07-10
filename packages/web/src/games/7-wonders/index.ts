import { lazy } from "react";
import type { PlayableModule } from "../types";

export default {
  component: lazy(() => import("./SevenWonders")),
  mode: "remote",
  soloLabel: "Play vs AI",
  bgaConnect: {
    label: "Connect to BGA",
    description: "Mirror a live Board Game Arena table in this board",
    component: lazy(() => import("./bga/BgaScreen")),
  },
} satisfies PlayableModule;
