import type { GameDefinition } from "../types";
import accent from "./accent.json";
import thumbnail from "./assets/thumbnail.png";
import bgg from "./bgg.json";

export default {
  slug: "phase-10",
  title: "Phase 10",
  bggId: 1258,
  bgg,
  thumbnail,
  accentHex: accent.hex,
} satisfies GameDefinition;
