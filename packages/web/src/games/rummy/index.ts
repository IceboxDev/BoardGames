import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "rummy",
  title: "Rummy",
  bggId: 15878,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
