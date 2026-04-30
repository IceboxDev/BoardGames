import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "tortuga-1667",
  title: "Tortuga 1667",
  bggId: 218530,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
