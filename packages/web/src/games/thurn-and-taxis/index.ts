import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "thurn-and-taxis",
  title: "Thurn and Taxis",
  bggId: 21790,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
