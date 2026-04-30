import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "a-game-of-thrones-the-card-game",
  title: "A Game of Thrones: The Card Game",
  bggId: 39953,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
