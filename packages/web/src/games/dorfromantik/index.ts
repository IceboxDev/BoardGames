import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "dorfromantik",
  title: "Dorfromantik",
  bggId: 370591,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
