import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "dungeons-and-dragons",
  title: "Dungeons & Dragons",
  bggId: 192,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
