import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "phase-10",
  title: "Phase 10",
  bggId: 1258,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
