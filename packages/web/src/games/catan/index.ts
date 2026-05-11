import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "catan",
  bggId: 13,
  accentHex: accent.hex,
} satisfies GameModule;
