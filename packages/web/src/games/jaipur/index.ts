import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "jaipur",
  title: "Jaipur",
  bggId: 54043,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
