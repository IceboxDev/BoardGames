import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "escape-tales-the-awakening",
  title: "Escape Tales: The Awakening",
  bggId: 253214,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
