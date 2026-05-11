import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "magic-the-gathering",
  bggId: 463,
  accentHex: accent.hex,
} satisfies GameModule;
