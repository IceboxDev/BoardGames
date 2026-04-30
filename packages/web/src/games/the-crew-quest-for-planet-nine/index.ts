import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "the-crew-quest-for-planet-nine",
  title: "The Crew: The Quest for Planet Nine",
  bggId: 284083,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
