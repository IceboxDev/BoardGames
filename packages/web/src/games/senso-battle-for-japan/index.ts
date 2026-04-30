import type { GameModule } from "../types";
import accent from "./accent.json";
import bgg from "./bgg.json";

export default {
  slug: "senso-battle-for-japan",
  title: "Sensō: Battle for Japan",
  bggId: 354219,
  bgg,
  accentHex: accent.hex,
} satisfies GameModule;
