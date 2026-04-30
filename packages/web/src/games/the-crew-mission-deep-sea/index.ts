import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "the-crew-mission-deep-sea",
  title: "The Crew: Mission Deep Sea",
  bggId: 324856,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
