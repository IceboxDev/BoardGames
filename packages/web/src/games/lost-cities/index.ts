import { lazy } from "react";
import type { GameDefinition } from "../types";
import backgroundImage from "./assets/background.png";
import thumbnail from "./assets/thumbnail.png";

export default {
  slug: "lost-cities",
  title: "Lost Cities",
  description: "Risk-reward decision analysis in a two-player expedition card game",
  thumbnail,
  backgroundImage,
  accentColor: {
    border: "hover:border-amber-500/30",
    hoverBg: "group-hover:bg-amber-500/5",
    arrow: "group-hover:text-amber-400",
    gradient: "from-amber-950/80 to-orange-950/80",
  },
  component: lazy(() => import("./LostCities")),
  mode: "remote",
} satisfies GameDefinition;
