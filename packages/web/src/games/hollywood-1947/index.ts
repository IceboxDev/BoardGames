import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "hollywood-1947",
  title: "Hollywood 1947",
  bggId: 370621,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
