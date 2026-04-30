import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "decrypto",
  title: "Decrypto",
  bggId: 225694,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
