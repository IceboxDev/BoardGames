/**
 * SGF (FF[4]) for Go: write a finished game, read a game's main line back.
 * Reading validates every move through the rules engine, so a parsed record
 * always replays. Variations are skipped (first branch only).
 */

import { fromSgfPoint, toSgfPoint } from "./coords";
import { newGame, play } from "./game";
import { handicapPoints } from "./handicap";
import type { GoReplayLog } from "./replay-log";
import { type Color, type GoGame, MAX_SIZE, MIN_SIZE } from "./types";

export const SGF_MAX_BYTES = 64 * 1024;
export const SGF_MAX_MOVES = 1000;

function esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/]/g, "\\]");
}

export interface SgfMeta {
  readonly black?: string;
  readonly white?: string;
  readonly date?: string;
}

export function toSgf(log: GoReplayLog, meta: SgfMeta = {}): string {
  const props: string[] = [
    "FF[4]",
    "GM[1]",
    "CA[UTF-8]",
    "AP[BoardGames:1]",
    `SZ[${log.size}]`,
    `KM[${log.komi}]`,
    "RU[Chinese]",
    `RE[${log.end.result === "0" ? "0" : esc(log.end.result)}]`,
  ];
  if (meta.black) props.push(`PB[${esc(meta.black)}]`);
  if (meta.white) props.push(`PW[${esc(meta.white)}]`);
  if (meta.date) props.push(`DT[${esc(meta.date)}]`);
  if (log.timeControl.kind === "fischer") {
    props.push(`TM[${log.timeControl.mainSec}]`, `OT[Fischer ${log.timeControl.incrementSec}]`);
  } else if (log.timeControl.kind === "byoyomi") {
    const tc = log.timeControl;
    props.push(`TM[${tc.mainSec}]`, `OT[${tc.periods}x${tc.periodSec} byo-yomi]`);
  }
  const stones = handicapPoints(log.size, log.handicap);
  if (stones.length > 0) {
    props.push(
      `HA[${log.handicap}]`,
      `AB${stones.map((p) => `[${toSgfPoint(log.size, p)}]`).join("")}`,
    );
  }
  const moves = log.moves.map(
    (m) => `;${m.c === 0 ? "B" : "W"}[${m.p === null ? "" : toSgfPoint(log.size, m.p)}]`,
  );
  return `(;${props.join("")}\n${moves.join("")})\n`;
}

export class SgfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SgfError";
  }
}

type Props = Map<string, string[]>;

interface Tree {
  readonly nodes: Props[];
  readonly children: Tree[];
}

/** A recursive-descent reader for SGF's `( ;node ;node (child) (child) )` trees. */
class Reader {
  private i = 0;
  constructor(private readonly text: string) {}

  private skipSpace(): void {
    while (this.i < this.text.length && /\s/.test(this.text[this.i] as string)) this.i++;
  }

  tree(): Tree {
    this.skipSpace();
    if (this.text[this.i] !== "(") throw new SgfError("Not an SGF file");
    this.i++;
    const nodes: Props[] = [];
    const children: Tree[] = [];
    for (;;) {
      this.skipSpace();
      const ch = this.text[this.i];
      if (ch === undefined) throw new SgfError("Unexpected end of file");
      if (ch === ";") {
        this.i++;
        nodes.push(this.node());
      } else if (ch === "(") {
        children.push(this.tree());
      } else if (ch === ")") {
        this.i++;
        return { nodes, children };
      } else {
        throw new SgfError(`Unexpected "${ch}"`);
      }
    }
  }

  private node(): Props {
    const props: Props = new Map();
    for (;;) {
      this.skipSpace();
      let ident = "";
      while (this.i < this.text.length && /[A-Za-z]/.test(this.text[this.i] as string)) {
        const c = this.text[this.i] as string;
        // FF[3]-style long names ("AddBlack") keep only their capitals.
        if (/[A-Z]/.test(c)) ident += c;
        this.i++;
      }
      if (!ident) return props;
      const values = props.get(ident) ?? [];
      this.skipSpace();
      while (this.text[this.i] === "[") {
        this.i++;
        let value = "";
        while (this.i < this.text.length && this.text[this.i] !== "]") {
          if (this.text[this.i] === "\\") this.i++;
          value += this.text[this.i] ?? "";
          this.i++;
        }
        this.i++;
        values.push(value);
        this.skipSpace();
      }
      props.set(ident, values);
    }
  }
}

/** The nodes of the main line (first variation at every fork), as property maps. */
function mainLine(text: string): Props[] {
  const start = text.indexOf("(");
  if (start < 0) throw new SgfError("Not an SGF file");
  const out: Props[] = [];
  let tree: Tree | undefined = new Reader(text.slice(start)).tree();
  while (tree) {
    out.push(...tree.nodes);
    tree = tree.children[0];
  }
  return out;
}

export interface ParsedSgf {
  readonly size: number;
  readonly komi: number;
  readonly handicap: number;
  readonly black: string | null;
  readonly white: string | null;
  readonly result: string | null;
  /** Points per move, `null` for passes, in order; colours as recorded. */
  readonly moves: readonly { readonly color: Color; readonly point: number | null }[];
  /** The final position (moves replayed). */
  readonly game: GoGame;
}

export function parseSgf(text: string): ParsedSgf {
  if (text.length > SGF_MAX_BYTES) throw new SgfError("File is too large");
  const nodes = mainLine(text);
  const root = nodes[0];
  if (!root) throw new SgfError("Empty SGF");
  if ((root.get("GM")?.[0] ?? "1") !== "1") throw new SgfError("Not a Go record");
  const size = Number(root.get("SZ")?.[0] ?? "19");
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    throw new SgfError(
      `Board size ${root.get("SZ")?.[0]} is not supported (${MIN_SIZE}–${MAX_SIZE})`,
    );
  }
  const komi = Number(root.get("KM")?.[0] ?? "7.5");
  const ab = (root.get("AB") ?? []).map((v) => fromSgfPoint(size, v));
  if (ab.some((p) => p === undefined || p === null)) throw new SgfError("Bad setup stone");
  const handicap = ab.length;
  const expected = handicapPoints(size, handicap);
  const sameAsFixed = expected.length === handicap && expected.every((p) => ab.includes(p));
  if (handicap > 0 && !sameAsFixed) {
    throw new SgfError("Only standard fixed handicap placements are supported");
  }
  let game = newGame({ size, komi: Number.isFinite(komi) ? komi : 7.5, handicap });
  const moves: { color: Color; point: number | null }[] = [];
  for (const node of nodes.slice(1)) {
    const b = node.get("B");
    const w = node.get("W");
    const value = b?.[0] ?? w?.[0];
    if (value === undefined) continue;
    const color: Color = b ? 0 : 1;
    if (moves.length >= SGF_MAX_MOVES) throw new SgfError("Too many moves");
    const point = fromSgfPoint(size, value);
    if (point === undefined) throw new SgfError(`Bad move "${value}" at move ${moves.length + 1}`);
    // Records may let one side move twice (a pass left out): insert the pass.
    if (color !== game.toMove) game = play(game, null);
    try {
      game = play(game, point);
    } catch {
      throw new SgfError(`Illegal move at move ${moves.length + 1}`);
    }
    moves.push({ color, point });
  }
  return {
    size,
    komi: game.komi,
    handicap,
    black: root.get("PB")?.[0] ?? null,
    white: root.get("PW")?.[0] ?? null,
    result: root.get("RE")?.[0] ?? null,
    moves,
    game,
  };
}
