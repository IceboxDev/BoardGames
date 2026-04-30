import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "wer-wars",
  title: "Who Was It?",
  bggId: 33643,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
