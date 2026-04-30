import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "quiztopia",
  title: "Quiztopia",
  bggId: 269970,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
