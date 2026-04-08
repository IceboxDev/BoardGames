import { lazy } from "react";
import type { GameDefinition } from "../types";
import backgroundImage from "./assets/background.png";
import rulesUrl from "./assets/rules.pdf";
import thumbnail from "./assets/thumbnail.png";

export default {
  slug: "set",
  title: "Set",
  description: "Combinatorial pattern recognition across shape, color, count, and fill",
  subtitle: "Find groups of three cards with matching or differing attributes",
  thumbnail,
  backgroundImage,
  accentColor: {
    border: "hover:border-emerald-500/30",
    hoverBg: "group-hover:bg-emerald-500/5",
    arrow: "group-hover:text-emerald-400",
    gradient: "from-emerald-950/80 to-teal-950/80",
  },
  component: lazy(() => import("./SetGame")),
  mode: "remote",
  soloLabel: "Trainer",
  hasMatchHistory: true,
  rulesUrl,
} satisfies GameDefinition;
