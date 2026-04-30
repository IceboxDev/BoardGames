import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "cascadia",
  title: "Cascadia",
  bggId: 295947,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
