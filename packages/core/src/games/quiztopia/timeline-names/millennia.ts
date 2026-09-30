import type { BlockName } from "./types.ts";

// Names for the millennia (round-number blocks: `mil:1000` = 1000–1999). See ./index.ts.

export const MILLENNIA: Readonly<Record<string, BlockName>> = {
  "mil:9000bc": { en: "Dawn of Farming", de: "Anfänge des Ackerbaus" },
  "mil:8000bc": { en: "First Farming Villages", de: "Die ersten Bauerndörfer" },
  "mil:7000bc": { en: "Rising Seas, New Crops", de: "Steigende Meere, neue Pflanzen" },
  "mil:6000bc": { en: "The Spread of Farming", de: "Der Ackerbau breitet sich aus" },
  "mil:5000bc": { en: "Farmers Settle Europe", de: "Bauern besiedeln Europa" },
  "mil:4000bc": { en: "Copper and Gold", de: "Kupfer und Gold" },
  "mil:3000bc": { en: "Cities and Writing", de: "Städte und Schrift" },
  "mil:2000bc": { en: "Age of the Pyramids", de: "Zeitalter der Pyramiden" },
  "mil:1000bc": { en: "Bronze Age Empires", de: "Reiche der Bronzezeit" },
  "mil:0bc": { en: "Classical Antiquity", de: "Klassische Antike" },
  "mil:0": { en: "Rome, Faith and Migration", de: "Rom, Kirche, Völkerwanderung" },
  "mil:1000": { en: "From Crusades to Computers", de: "Von Kreuzzügen zum Computer" },
  "mil:2000": { en: "The Connected World", de: "Die vernetzte Welt" },
};
