import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "codenames-duet",
  title: "Codenames: Duet",
  bggId: 224037,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
