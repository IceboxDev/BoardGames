#!/usr/bin/env node
// commit-msg hook: no co-author / AI attribution lines in commit messages, ever.
import { readFileSync } from "node:fs";

const BANNED = [/^\s*co-authored-by:/i, /^\s*claude-session:/i, /generated with \[?claude code/i];

const msg = readFileSync(process.argv[2], "utf8");
const hits = msg
  .split("\n")
  .filter((line) => !line.startsWith("#") && BANNED.some((re) => re.test(line)));
if (hits.length > 0) {
  console.error("Commit message carries attribution lines, which this repo forbids:");
  for (const line of hits) console.error(`  ${line}`);
  console.error("Remove them and commit again.");
  process.exit(1);
}
