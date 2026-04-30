import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "wo-wars",
  title: "Where Was It?",
  bggId: 53279,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
