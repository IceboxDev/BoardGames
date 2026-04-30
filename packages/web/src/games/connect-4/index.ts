import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "connect-4",
  title: "Connect 4",
  bggId: 2719,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
