import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "rummikub",
  bggId: 811,
  accentHex: accent.hex,
} satisfies GameModule;
