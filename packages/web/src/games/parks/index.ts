import { lazy } from "react";
import type { GameDefinition } from "../types";
import backgroundImage from "./assets/background.png";
import thumbnail from "./assets/thumbnail.png";

export default {
  slug: "parks",
  title: "Parks",
  description: "Hike the trail, visit America's national parks, and collect memories",
  subtitle: "Hike the trail and visit America's national parks",
  thumbnail,
  backgroundImage,
  accentColor: {
    border: "hover:border-amber-500/30",
    hoverBg: "group-hover:bg-amber-500/5",
    arrow: "group-hover:text-amber-400",
    gradient: "from-amber-950/80 to-stone-950/80",
  },
  component: lazy(() => import("./Parks")),
  mode: "remote",
} satisfies GameDefinition;
