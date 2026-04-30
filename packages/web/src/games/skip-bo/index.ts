import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "skip-bo",
  title: "Skip-Bo",
  bggId: 1269,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
