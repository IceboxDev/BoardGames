import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "a-game-of-thrones-the-card-game",
  title: "A Game of Thrones: The Card Game",
  bggId: 39953,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
