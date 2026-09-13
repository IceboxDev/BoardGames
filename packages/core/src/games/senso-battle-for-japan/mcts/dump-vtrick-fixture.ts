// Parity fixture for scripts/senso-train/vtrick_features.py: the TS
// expected-tier features of the first ply rows of a collector file, carrying
// the raw rows so the check is self-contained. Not bundled.
//   tsx .../dump-vtrick-fixture.ts <plies.bin> <out.json> [rows=64]
import { writeFileSync } from "node:fs";
import { readSampleFile } from "./sample-file";
import { fastFromPlyRow, VTRICK_FEATURES, vtrickFeatures } from "./vtrick-features";

const [
  input = "scratch/value/smoke5.plies.bin",
  output = "scratch/value/vtrick-fixture.json",
  rowsArg = "64",
] = process.argv.slice(2);
const file = readSampleFile(input);
const at = { index: (name: string) => file.columns.indexOf(name) };
const rows: number[][] = [];
const cases: { row: number; x: number[] }[] = [];
const feats = new Float32Array(VTRICK_FEATURES);
const voids = new Uint8Array(5);
const voids0 = at.index("voids[0]");
const roundCol = at.index("round");
for (let r = 0; r < file.rows && rows.length < Number(rowsArg); r++) {
  const row = file.data.subarray(r * file.rowFloats, (r + 1) * file.rowFloats);
  rows.push(Array.from(row));
  const f = fastFromPlyRow(row, at);
  for (let s = 0; s < 5; s++) voids[s] = row[voids0 + s];
  vtrickFeatures(f, voids, row[roundCol], feats);
  cases.push({ row: rows.length - 1, x: Array.from(feats, (v) => Math.round(v * 1e6) / 1e6) });
}
writeFileSync(
  output,
  JSON.stringify({ source: input, features: VTRICK_FEATURES, columns: file.columns, rows, cases }),
);
console.log(`${output}: ${cases.length} plies`);
