# Quiz archive

The primary evidence behind the quiz bank (`packages/core/src/quiz/content/`): the original
photo of every printed card a question came from, and later the transcripts, past ingest runs
and snapshots of cited pages. The bank is the edited, current text. The archive is what the
cards really say, and it is what any fact can be traced back to.

The archive lives outside `core`, so neither the web bundle nor Railway's watch paths see it.
Nothing at runtime reads it.

## Layout

```
photos/<source>/<card>.jpg         the card's photo (LFS)
photos/<source>/<card>.dupN.jpg    a re-photographed copy of the same card (LFS)
manifest/<source>.json             one entry per card, in the source file's order
```

`<source>` and `<card>` are the ids in `packages/core/src/quiz/content/sources/<source>.json`,
and that file's `image` is the photo's original name.

Each manifest entry is shaped like this:

```jsonc
{
  "card": "c001",
  "file": "photos/quiztopia/c001.jpg",      // relative to this folder
  "originalName": "IMG20260910164837.jpg",  // the name the phone gave it
  "sha256Original": "…",                    // the file as it came off the phone
  "sha256Stored": "…",                      // the file stored here (GPS removed)
  "bytes": 6413611, "width": 2290, "height": 3150,
  "takenAt": "2026-09-10T16:48:37+02:00",   // EXIF DateTimeOriginal (+ OffsetTimeOriginal)
  "device": "OPPO Find X9 Ultra",           // EXIF Make + Model
  "rotate": 270,                            // clockwise degrees that turn the photo upright
  "duplicates": [{ "file", "originalName", "sha256Original", "sha256Stored" }]
}
```

Current sources: `quiztopia` (177 cards and 17 re-shot duplicates), `trivial-pursuit` (400),
`publish-or-perish` (100) and `publish-or-perish-mge` (160).

## GPS policy

The photos are the phone's original JPEGs. The only change is that the EXIF **GPS block is
removed**, losslessly. Nothing is re-encoded. In the Exif APP1 segment, the GPSInfo pointer
is dropped from IFD0 and the GPS IFD and its values are overwritten with zeros, so the segment
keeps its size and every offset stays where it was. The script checks each file it writes:

- the stored file is the same size as the original;
- every byte outside the Exif segment is identical, including the scan data, the MakerNote,
  the thumbnail and the embedded MPF images;
- every EXIF tag except GPS reads back unchanged.

`sha256Original` is kept so that a photo can still be matched against a copy straight off the
phone.

## Git LFS

`.gitattributes` routes `photos/**` and `snapshots/**` to LFS. The full archive is about 3 GB.
Vercel's build runs `git lfs pull --exclude="packages/quiz-archive/**"`, so deploys never
download it. To fetch it locally, run `git lfs pull --include="packages/quiz-archive/**"`.

`packages/core/src/quiz/archive.test.ts` checks the following:

- every card in the bank has exactly one manifest entry whose files exist;
- every entry is a real card;
- the size and sha256 of each photo match the manifest.

A photo that is still an LFS pointer (not pulled) is skipped by the hash check.

## Adding a game's photos (or rebuilding one)

1. Add the cards to `content/sources/<source>.json` through the ingest pipeline. Each card's
   `image` is the photo's file name.
2. If the photos need a rotation other than the defaults, add the source to `DEFAULT_ROTATE`
   in `scripts/quiz-archive/photos.py`, following its `layout` text in
   `packages/core/src/quiz/sources.ts`. Otherwise pass `--rotate`.
3. From the repo root, run:

   ```bash
   uv run --with piexif --with pillow python -I scripts/quiz-archive/photos.py \
     --source <source> --photos <dir> [--photos <another dir>] [--duplicates dups.tsv]
   ```

   `--photos` dirs are searched in order for each card's `image`. `--duplicates` is a TSV of
   `<duplicate photo>\t<photo the card uses>` lines, and each one is stored as
   `<card>.dupN.jpg`. The script rebuilds that source's photos and manifest from scratch:
   - running it again with the same inputs writes byte-identical files;
   - photos that no longer belong to a card are deleted.
4. Run `pnpm --filter @boardgames/core exec vitest run src/quiz/archive.test.ts`.
