import { lazy } from "react";
import type { GameDefinition } from "../types";
import thumbnail from "./assets/thumbnail.png";

export default {
  slug: "exploding-kittens",
  title: "Exploding Kittens",
  description: "Probability and bluffing dynamics in a strategic card game",
  thumbnail,
  component: lazy(() => import("./ExplodingKittens")),
} satisfies GameDefinition;
