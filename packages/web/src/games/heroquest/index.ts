import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "heroquest",
  title: "HeroQuest",
  bggId: 699,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
