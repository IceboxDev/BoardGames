import type { GameModule } from "../types";
import accent from "./accent.json";

export default {
  slug: "trivial-pursuit",
  displayTitle: "Trivial Pursuit",
  bggId: 2952,
  accentHex: accent.hex,
} satisfies GameModule;
