// Flat float32 sample files for the value-net pipeline. jsonl was fine for the
// 100k-row policy sets; the round/ply collectors write millions of rows, so
// they use the layout the 7 Wonders trainer already reads
// (`cpp/seven-wonders/train/loop.py`): a small header, then rows of float32.
//
//   header: magic u32 · version u32 · players u32 (0 = mixed) · rowFloats u32 · rows u32
//   body:   rows × rowFloats little-endian float32
//
// A sidecar `<file>.cols.json` names every column so the Python side never
// hard-codes offsets. Node-only (fs); never bundled.

import { closeSync, openSync, readFileSync, writeSync } from "node:fs";

export const SAMPLE_VERSION = 1;
const HEADER_BYTES = 20;

export interface SampleColumns {
  /** Column names in row order; a name with `[k]` marks a block of k floats. */
  columns: readonly string[];
}

/** Expand `name[k]` entries into flat column names. */
export function flatColumns(spec: SampleColumns): string[] {
  const out: string[] = [];
  for (const name of spec.columns) {
    const m = /^(.*)\[(\d+)\]$/.exec(name);
    if (!m) out.push(name);
    else for (let i = 0; i < Number(m[2]); i++) out.push(`${m[1]}[${i}]`);
  }
  return out;
}

export class SampleWriter {
  private readonly fd: number;
  private readonly rowFloats: number;
  private rows = 0;
  private readonly chunk: Float32Array;
  private filled = 0;

  constructor(path: string, magic: string, players: number, spec: SampleColumns, chunkRows = 4096) {
    if (magic.length !== 4) throw new Error("magic must be four ASCII characters");
    const cols = flatColumns(spec);
    this.rowFloats = cols.length;
    this.chunk = new Float32Array(this.rowFloats * chunkRows);
    this.fd = openSync(path, "w");
    const header = Buffer.alloc(HEADER_BYTES);
    header.writeUInt32LE(magicCode(magic), 0);
    header.writeUInt32LE(SAMPLE_VERSION, 4);
    header.writeUInt32LE(players, 8);
    header.writeUInt32LE(this.rowFloats, 12);
    header.writeUInt32LE(0, 16);
    writeSync(this.fd, header);
    writeSync(
      openSyncSidecar(path),
      JSON.stringify({ magic, version: SAMPLE_VERSION, players, columns: cols }, null, 0),
    );
  }

  /** Append one row; `row` must have exactly `rowFloats` entries. */
  push(row: ArrayLike<number>): void {
    if (row.length !== this.rowFloats) {
      throw new Error(`row has ${row.length} floats, expected ${this.rowFloats}`);
    }
    this.chunk.set(row, this.filled * this.rowFloats);
    this.filled++;
    this.rows++;
    if (this.filled * this.rowFloats === this.chunk.length) this.flush();
  }

  private flush(): void {
    if (this.filled === 0) return;
    writeSync(this.fd, Buffer.from(this.chunk.buffer, 0, this.filled * this.rowFloats * 4));
    this.filled = 0;
  }

  get count(): number {
    return this.rows;
  }

  close(): number {
    this.flush();
    const rows = Buffer.alloc(4);
    rows.writeUInt32LE(this.rows, 0);
    writeSync(this.fd, rows, 0, 4, 16);
    closeSync(this.fd);
    return this.rows;
  }
}

function openSyncSidecar(path: string): number {
  const fd = openSync(`${path}.cols.json`, "w");
  return fd;
}

function magicCode(magic: string): number {
  let code = 0;
  for (let i = 0; i < 4; i++) code |= magic.charCodeAt(i) << (8 * i);
  return code >>> 0;
}

export interface SampleFile {
  magic: string;
  version: number;
  players: number;
  rowFloats: number;
  rows: number;
  data: Float32Array;
  columns: string[];
}

/** Read a whole sample file (tests and small diagnostics; Python reads the big ones). */
export function readSampleFile(path: string): SampleFile {
  const buf = readFileSync(path);
  const magicNum = buf.readUInt32LE(0);
  const magic = String.fromCharCode(
    magicNum & 0xff,
    (magicNum >>> 8) & 0xff,
    (magicNum >>> 16) & 0xff,
    (magicNum >>> 24) & 0xff,
  );
  const version = buf.readUInt32LE(4);
  const players = buf.readUInt32LE(8);
  const rowFloats = buf.readUInt32LE(12);
  const rows = buf.readUInt32LE(16);
  const body = buf.subarray(HEADER_BYTES, HEADER_BYTES + rows * rowFloats * 4);
  const data = new Float32Array(rows * rowFloats);
  for (let i = 0; i < data.length; i++) data[i] = body.readFloatLE(i * 4);
  const sidecar = JSON.parse(readFileSync(`${path}.cols.json`, "utf8")) as { columns: string[] };
  return { magic, version, players, rowFloats, rows, data, columns: sidecar.columns };
}
