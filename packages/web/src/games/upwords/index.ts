import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "upwords",
  title: "Upwords",
  bggId: 1515,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
