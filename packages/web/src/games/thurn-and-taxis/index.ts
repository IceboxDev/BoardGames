import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "thurn-and-taxis",
  title: "Thurn and Taxis",
  bggId: 21790,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
