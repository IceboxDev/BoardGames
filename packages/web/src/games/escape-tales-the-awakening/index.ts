import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "escape-tales-the-awakening",
  title: "Escape Tales: The Awakening",
  bggId: 253214,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
