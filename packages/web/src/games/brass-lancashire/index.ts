import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "brass-lancashire",
  bggId: 28720,
  accentHex: accent.hex,
  family: { id: "brass", variant: "Lancashire" },
} satisfies GameModule;
