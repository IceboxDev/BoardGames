import { lazy } from "react";
import type { GameDefinition } from "../types";
import backgroundImage from "./assets/background.png";
import thumbnail from "./assets/thumbnail.png";

export default {
  slug: "exploding-kittens",
  title: "Exploding Kittens",
  description: "Probability and bluffing dynamics in a strategic card game",
  thumbnail,
  backgroundImage,
  accentColor: {
    border: "hover:border-rose-500/30",
    hoverBg: "group-hover:bg-rose-500/5",
    arrow: "group-hover:text-rose-400",
    gradient: "from-rose-950/80 to-red-950/80",
  },
  component: lazy(() => import("./ExplodingKittens")),
  mode: "remote",
} satisfies GameDefinition;
