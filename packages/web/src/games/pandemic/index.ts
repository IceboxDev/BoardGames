import { lazy } from "react";
import type { GameDefinition } from "../types";
import backgroundImage from "./assets/img/background.png";
import rulesUrl from "./assets/img/rules.pdf";
import thumbnail from "./assets/img/thumbnail.png";

export default {
  slug: "pandemic",
  title: "Pandemic",
  description: "Cooperative strategy optimization against stochastic disease spread",
  subtitle: "Work together to stop four deadly diseases from spreading",
  thumbnail,
  backgroundImage,
  accentColor: {
    border: "hover:border-sky-500/30",
    hoverBg: "group-hover:bg-sky-500/5",
    arrow: "group-hover:text-sky-400",
    gradient: "from-sky-950/80 to-indigo-950/80",
  },
  component: lazy(() => import("./Pandemic")),
  mode: "remote",
  soloLabel: "Solo",
  rulesUrl,
} satisfies GameDefinition;
