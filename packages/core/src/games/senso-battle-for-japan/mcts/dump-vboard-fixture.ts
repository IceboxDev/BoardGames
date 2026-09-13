// Parity fixture for scripts/senso-train/vboard_features.py (board value net),
// self-contained like the other dumpers. Not bundled.
//   tsx .../dump-vboard-fixture.ts <rounds.bin> <out.json> [rows=24]
import { writeFileSync } from "node:fs";
import { readSampleFile } from "./sample-file";
import { VBOARD_FEATURES, vboardFeatures } from "./vboard-features";
import { roundViewFromRow } from "./vround-features";

const [
  input = "scratch/value/smoke5.rounds.bin",
  output = "scratch/value/vboard-fixture.json",
  rowsArg = "24",
] = process.argv.slice(2);
const file = readSampleFile(input);
const at = { index: (name: string) => file.columns.indexOf(name) };
const variantCol = at.index("variant");
const rows: number[][] = [];
const cases: { row: number; s: number; x: number[] }[] = [];
const feats = new Float32Array(VBOARD_FEATURES);
for (let r = 0; r < file.rows && rows.length < Number(rowsArg); r++) {
  const row = file.data.subarray(r * file.rowFloats, (r + 1) * file.rowFloats);
  if (row[variantCol] < 0) continue;
  const local = rows.length;
  rows.push(Array.from(row));
  const view = roundViewFromRow(row, at);
  for (let s = 0; s < view.n; s++) {
    vboardFeatures(view, s, feats);
    cases.push({ row: local, s, x: Array.from(feats, (v) => Math.round(v * 1e6) / 1e6) });
  }
}
writeFileSync(
  output,
  JSON.stringify({ source: input, features: VBOARD_FEATURES, columns: file.columns, rows, cases }),
);
console.log(`${output}: ${cases.length} boards from ${rows.length} rows`);
