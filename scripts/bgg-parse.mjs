// XML → BggGame parser shared by scripts/fetch-bgg.mjs.
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  trimValues: true,
});

function num(v) {
  if (v === undefined || v === "" || v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function arr(x) {
  if (x === undefined) return [];
  return Array.isArray(x) ? x : [x];
}

function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&#10;/g, "\n")
    .replace(/&#13;/g, "\r")
    .replace(/&#9;/g, "\t")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function pickName(item) {
  const names = arr(item.name);
  const primary = names.find((n) => n.type === "primary");
  return (primary ?? names[0])?.value ?? "";
}

function linksByType(item, type) {
  return arr(item.link)
    .filter((l) => l.type === type)
    .map((l) => l.value ?? "")
    .filter(Boolean);
}

function normalizeItem(item) {
  const ratings = item.statistics?.ratings;
  return {
    id: Number(item.id ?? 0),
    name: pickName(item),
    description: decodeEntities(item.description ?? ""),
    yearPublished: num(item.yearpublished?.value),
    minPlayers: num(item.minplayers?.value),
    maxPlayers: num(item.maxplayers?.value),
    playingTime: num(item.playingtime?.value),
    minPlayTime: num(item.minplaytime?.value),
    maxPlayTime: num(item.maxplaytime?.value),
    minAge: num(item.minage?.value),
    categories: linksByType(item, "boardgamecategory"),
    mechanics: linksByType(item, "boardgamemechanic"),
    designers: linksByType(item, "boardgamedesigner"),
    artists: linksByType(item, "boardgameartist"),
    publishers: linksByType(item, "boardgamepublisher"),
    averageRating: num(ratings?.average?.value),
    averageWeight: num(ratings?.averageweight?.value),
    numRatings: num(ratings?.usersrated?.value),
  };
}

export function parseBggXml(xml) {
  const parsed = parser.parse(xml);
  const items = arr(parsed.items?.item);
  const out = {};
  for (const item of items) {
    const game = normalizeItem(item);
    if (game.id) out[game.id] = game;
  }
  return out;
}
