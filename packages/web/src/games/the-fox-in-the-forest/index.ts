import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "the-fox-in-the-forest",
  title: "The Fox in the Forest",
  bggId: 221965,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
