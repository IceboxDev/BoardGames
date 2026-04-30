import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "the-old-kings-crown",
  title: "The Old King's Crown",
  bggId: 357873,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
