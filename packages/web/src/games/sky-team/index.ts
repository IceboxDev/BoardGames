import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "sky-team",
  title: "Sky Team",
  bggId: 373106,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
