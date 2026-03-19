import type { CardColor, Count, Fill, SetCardData, Shape } from "./types";

const SHAPES: Shape[] = ["diamond", "oval", "squiggle"];
const COLORS: CardColor[] = ["red", "green", "purple"];
const FILLS: Fill[] = ["solid", "striped", "empty"];
const COUNTS: Count[] = [1, 2, 3];

export function buildFullDeck(): SetCardData[] {
  const cards: SetCardData[] = [];
  let id = 0;
  for (const shape of SHAPES)
    for (const color of COLORS)
      for (const fill of FILLS)
        for (const count of COUNTS) cards.push({ id: id++, shape, color, fill, count });
  return cards;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function isValidSet(a: SetCardData, b: SetCardData, c: SetCardData): boolean {
  const valid = (prop: keyof SetCardData) => {
    const vals = [a[prop], b[prop], c[prop]];
    const allSame = vals[0] === vals[1] && vals[1] === vals[2];
    const allDiff = vals[0] !== vals[1] && vals[1] !== vals[2] && vals[0] !== vals[2];
    return allSame || allDiff;
  };
  return valid("shape") && valid("color") && valid("fill") && valid("count");
}

export function tableHasSet(table: SetCardData[]): boolean {
  for (let i = 0; i < table.length; i++)
    for (let j = i + 1; j < table.length; j++)
      for (let k = j + 1; k < table.length; k++)
        if (isValidSet(table[i], table[j], table[k])) return true;
  return false;
}

export function countSetsOnTable(table: SetCardData[]): number {
  let count = 0;
  for (let i = 0; i < table.length; i++)
    for (let j = i + 1; j < table.length; j++)
      for (let k = j + 1; k < table.length; k++)
        if (isValidSet(table[i], table[j], table[k])) count++;
  return count;
}

export function setKey(a: number, b: number, c: number): string {
  return a < b
    ? b < c
      ? `${a}-${b}-${c}`
      : a < c
        ? `${a}-${c}-${b}`
        : `${c}-${a}-${b}`
    : a < c
      ? `${b}-${a}-${c}`
      : b < c
        ? `${b}-${c}-${a}`
        : `${c}-${b}-${a}`;
}

export type SetTriple = [SetCardData, SetCardData, SetCardData];

export function findAllSets(table: SetCardData[]): SetTriple[] {
  const result: SetTriple[] = [];
  for (let i = 0; i < table.length; i++)
    for (let j = i + 1; j < table.length; j++)
      for (let k = j + 1; k < table.length; k++)
        if (isValidSet(table[i], table[j], table[k])) result.push([table[i], table[j], table[k]]);
  return result;
}
