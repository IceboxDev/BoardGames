import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "hitster",
  title: "Hitster",
  bggId: 318243,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
