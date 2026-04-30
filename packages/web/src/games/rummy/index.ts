import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "rummy",
  title: "Rummy",
  bggId: 15878,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
