import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "senso-battle-for-japan",
  title: "Sensō: Battle for Japan",
  bggId: 354219,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
