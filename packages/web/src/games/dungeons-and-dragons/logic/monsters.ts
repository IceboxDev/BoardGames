// Mock monster compendium: canonical stat lines for creatures that appear in
// danger tables and encounters but have no campaign card (SRD beasts). Will
// be replaced by the internal monster database; the lookup seam is what
// matters. Case-insensitive.

export interface MonsterEntry {
  name: string;
  dex: number;
  maxHp: number;
  armorClass: number;
}

const MONSTERS: Record<string, MonsterEntry> = {
  wolf: { name: "Wolf", dex: 15, maxHp: 11, armorClass: 13 },
  panther: { name: "Panther", dex: 15, maxHp: 13, armorClass: 12 },
  vulture: { name: "Vulture", dex: 10, maxHp: 5, armorClass: 10 },
  "giant spider": { name: "Giant Spider", dex: 16, maxHp: 26, armorClass: 14 },
  "giant goat": { name: "Giant Goat", dex: 11, maxHp: 19, armorClass: 11 },
  "swarm of wasps": { name: "Swarm of Wasps", dex: 13, maxHp: 22, armorClass: 12 },
};

export function getMonsterEntry(name: string): MonsterEntry | null {
  return MONSTERS[name.trim().toLowerCase()] ?? null;
}
