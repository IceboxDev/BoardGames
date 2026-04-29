import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "uno",
  title: "UNO",
  bggId: 2223,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
