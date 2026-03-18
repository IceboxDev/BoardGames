import { lazy } from "react";
import type { GameDefinition } from "../types";
import thumbnail from "./assets/img/thumbnail.png";

export default {
  slug: "pandemic",
  title: "Pandemic",
  description: "Cooperative strategy optimization against stochastic disease spread",
  thumbnail,
  component: lazy(() => import("./Pandemic")),
} satisfies GameDefinition;
