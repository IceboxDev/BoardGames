import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "dungeons-and-dragons",
  bggId: 0,
  accentHex: accent.hex,
} satisfies GameModule;
