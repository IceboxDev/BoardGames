import { lazy } from "react";
import type { GameDefinition } from "../types";
import thumbnail from "./assets/thumbnail.png";

export default {
  slug: "lost-cities",
  title: "Lost Cities",
  description: "Risk-reward decision analysis in a two-player expedition card game",
  thumbnail,
  component: lazy(() => import("./LostCities")),
} satisfies GameDefinition;
