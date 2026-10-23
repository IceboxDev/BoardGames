// The card photo archive in `packages/quiz-archive/` matches the bank: every
// printed card in `./content/sources/` has exactly one manifest entry whose
// photo exists, and every manifest entry is a real card. A stored photo is
// hashed only when it is real bytes, not an LFS pointer (a checkout without
// `git lfs pull`).

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CONTENT = fileURLToPath(new URL("./content/sources/", import.meta.url));
const ARCHIVE = fileURLToPath(new URL("../../../quiz-archive/", import.meta.url));

interface StoredFile {
  file: string;
  originalName: string;
  sha256Original: string;
  sha256Stored: string;
}
interface ManifestCard extends StoredFile {
  card: string;
  bytes: number;
  width: number;
  height: number;
  takenAt: string | null;
  device: string | null;
  rotate: number;
  duplicates: StoredFile[];
}
interface SourceFile {
  source: string;
  cards: { id: string; image: string }[];
}
interface Manifest {
  source: string;
  cards: ManifestCard[];
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

const sources = readdirSync(CONTENT)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => readJson(`${CONTENT}${f}`) as SourceFile);

const isLfsPointer = (path: string): boolean => {
  if (statSync(path).size > 1024) return false;
  return readFileSync(path, "utf8").startsWith("version https://git-lfs");
};

describe("quiz card archive", () => {
  for (const source of sources) {
    describe(source.source, () => {
      const manifestPath = `${ARCHIVE}manifest/${source.source}.json`;
      const manifest = readJson(manifestPath) as Manifest;

      it("has exactly one entry per card, in source order", () => {
        expect(manifest.source).toBe(source.source);
        expect(manifest.cards.map((c) => c.card)).toEqual(source.cards.map((c) => c.id));
        const byId = new Map(source.cards.map((c) => [c.id, c.image]));
        for (const entry of manifest.cards) expect(entry.originalName).toBe(byId.get(entry.card));
      });

      it("points every entry at an existing photo", () => {
        for (const entry of manifest.cards) {
          expect([0, 90, 180, 270]).toContain(entry.rotate);
          for (const f of [entry, ...entry.duplicates]) {
            expect(f.file.startsWith(`photos/${source.source}/${entry.card}.`), f.file).toBe(true);
            expect(existsSync(`${ARCHIVE}${f.file}`), f.file).toBe(true);
          }
        }
      });

      it("stores photos whose bytes match the manifest", () => {
        for (const entry of manifest.cards) {
          const path = `${ARCHIVE}${entry.file}`;
          if (!isLfsPointer(path)) expect(statSync(path).size, entry.file).toBe(entry.bytes);
          for (const f of [entry, ...entry.duplicates]) {
            const p = `${ARCHIVE}${f.file}`;
            if (isLfsPointer(p)) continue;
            const sha = createHash("sha256").update(readFileSync(p)).digest("hex");
            expect(sha, f.file).toBe(f.sha256Stored);
          }
        }
      }, 60_000); // ~1 GB a source: a cold disk cache can take seconds
    });
  }

  it("has no manifest for a source the bank doesn't have", () => {
    const manifests = readdirSync(`${ARCHIVE}manifest`)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    expect(manifests).toEqual(sources.map((s) => s.source).sort());
  });
});
