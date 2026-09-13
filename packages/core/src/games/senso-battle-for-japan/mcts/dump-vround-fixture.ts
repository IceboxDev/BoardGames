// Writes a parity fixture for scripts/senso-train/vround_features.py: the TS
// cell features of the first rows of a collector file, for every perspective,
// actor and three tiers. The trainer refuses to run when its Python port
// disagrees. Not bundled.
//   tsx .../dump-vround-fixture.ts <rounds.bin> <out.json> [rows=12]
import { writeFileSync } from "node:fs";
import { readSampleFile } from "./sample-file";
import {
  roundViewFromRow,
  VROUND_FEATURES,
  VROUND_TIERS,
  vroundCellFeatures,
} from "./vround-features";

const [
  input = "scratch/value/smoke.rounds.bin",
  output = "scratch/value/vround-fixture.json",
  rowsArg = "12",
] = process.argv.slice(2);
const file = readSampleFile(input);
const at = { index: (name: string) => file.columns.indexOf(name) };
const variantCol = at.index("variant");
// Self-contained: the raw rows travel with the fixture so the Python check
// never depends on which sample file the trainer was given.
const rows: number[][] = [];
const cases: { row: number; s: number; p: number; t: number; x: number[] }[] = [];
const feats = new Float32Array(VROUND_FEATURES);
for (let r = 0; r < file.rows && rows.length < Number(rowsArg); r++) {
  const row = file.data.subarray(r * file.rowFloats, (r + 1) * file.rowFloats);
  if (row[variantCol] < 0) continue;
  const local = rows.length;
  rows.push(Array.from(row));
  const view = roundViewFromRow(row, at);
  for (let s = 0; s < view.n; s++) {
    for (let p = 0; p < view.n; p++) {
      for (const t of [0, 2, VROUND_TIERS - 1]) {
        vroundCellFeatures(view, s, p, t, feats);
        cases.push({ row: local, s, p, t, x: Array.from(feats, (v) => Math.round(v * 1e6) / 1e6) });
      }
    }
  }
}
writeFileSync(
  output,
  JSON.stringify({ source: input, features: VROUND_FEATURES, columns: file.columns, rows, cases }),
);
console.log(`${output}: ${cases.length} cells from ${rows.length} rows`);
