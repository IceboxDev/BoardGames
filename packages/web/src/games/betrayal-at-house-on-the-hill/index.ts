import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "betrayal-at-house-on-the-hill",
  title: "Betrayal at House on the Hill",
  bggId: 10547,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
