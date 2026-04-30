import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "captain-sonar",
  title: "Captain Sonar",
  bggId: 171131,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
