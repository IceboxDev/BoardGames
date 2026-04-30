import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "hell-of-a-deal",
  title: "Hell of a Deal",
  bggId: 463605,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
