import { lazy } from "react";
import type { GameDefinition } from "../types";
import thumbnail from "./assets/thumbnail.png";

export default {
  slug: "set",
  title: "Set",
  description: "Combinatorial pattern recognition across shape, color, count, and fill",
  thumbnail,
  component: lazy(() => import("./SetGame")),
} satisfies GameDefinition;
