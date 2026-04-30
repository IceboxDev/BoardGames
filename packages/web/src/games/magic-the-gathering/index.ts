import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "magic-the-gathering",
  title: "Magic: The Gathering",
  bggId: 463,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
