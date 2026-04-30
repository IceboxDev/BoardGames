import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "ark-nova",
  title: "Ark Nova",
  bggId: 342942,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
