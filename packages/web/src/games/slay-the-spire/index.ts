import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "slay-the-spire",
  title: "Slay the Spire: The Board Game",
  bggId: 338960,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
