import { lazy } from "react";
import type { PlayableModule } from "../types";
import cardEffectsUrl from "./assets/card-effects.pdf";
import chainsUrl from "./assets/chains.pdf";
import baseRulesUrl from "./assets/rules.pdf";

export default {
  component: lazy(() => import("./SevenWonders")),
  extraMode: "companion",
  // The rulebook plus the two reference sheets that ship with it.
  rulesUrl: [
    { label: "Rules", url: baseRulesUrl },
    { label: "Card Effects", url: cardEffectsUrl },
    { label: "Chains", url: chainsUrl },
  ],
  bgaConnect: {
    label: "Connect to BGA",
    description: "Mirror a live Board Game Arena table in this board",
    component: lazy(() => import("./bga/BgaScreen")),
  },
} satisfies PlayableModule;
