"""(Re)build one source's card photos + manifest in packages/quiz-archive/.

Usage (from the repo root):

    uv run --with piexif --with pillow python -I scripts/quiz-archive/photos.py \
        --source trivial-pursuit --photos ~/Downloads/Photos-1-001 --photos ~/Downloads/extra

    uv run --with piexif --with pillow python -I scripts/quiz-archive/photos.py \
        --source quiztopia --photos /tmp/.../quiztopia --duplicates /tmp/.../duplicates.tsv

Every card in packages/core/src/quiz/content/sources/<source>.json names its photo
(`image`); the script finds that file in the --photos dirs (searched in order), removes the
GPS EXIF block losslessly (only the Exif APP1 segment is rewritten; every other byte of the
file, the scan data and the embedded MPF images included, is kept and verified) and writes
photos/<source>/<card>.jpg plus manifest/<source>.json. Re-running with the same inputs
gives byte-identical output; stale files in photos/<source>/ are removed.

--duplicates is a TSV of re-photographed cards: `<duplicate photo>\t<photo the source uses>`
(extensions optional, extra columns ignored). Each is stored as <card>.dup1.jpg, .dup2.jpg ...
--rotate sets the clockwise degrees that turn the photo upright (default per source below).
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
from pathlib import Path

import piexif
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
SOURCES_DIR = REPO / "packages/core/src/quiz/content/sources"
ARCHIVE = REPO / "packages/quiz-archive"

# Clockwise degrees to read each source's photos upright (sources.ts `layout`).
DEFAULT_ROTATE = {
    "quiztopia": 270,  # "Rotate 90° left"
    "trivial-pursuit": 90,
    "publish-or-perish": 180,  # "upside down"
    "publish-or-perish-mge": 0,  # "upright"
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def exif_segment(data: bytes) -> tuple[int, int]:
    """Byte range [start, end) of the Exif APP1 segment (marker included)."""
    if data[:2] != b"\xff\xd8":
        raise ValueError("not a JPEG")
    i = 2
    while i + 4 <= len(data):
        if data[i] != 0xFF:
            raise ValueError(f"bad marker at {i}")
        marker = data[i + 1]
        if marker == 0xDA:  # start of scan: no Exif before it
            break
        length = int.from_bytes(data[i + 2 : i + 4], "big")
        if marker == 0xE1 and data[i + 4 : i + 10] == b"Exif\x00\x00":
            return i, i + 2 + length
        i += 2 + length
    raise ValueError("no Exif APP1 segment")


TYPE_SIZES = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8}
GPS_TAG = 0x8825


def strip_gps(data: bytes) -> bytes:
    """The same JPEG with the GPS IFD zeroed out in place.

    The Exif segment keeps its size and every other offset: IFD0 is rewritten without its
    GPSInfo pointer (entries close up, the freed 12 bytes become zeros) and the GPS IFD plus
    its out-of-line values are overwritten with zeros. Nothing else in the file changes, so
    the MakerNote, thumbnail, scan data and embedded MPF images stay byte-identical.
    """
    s0, e0 = exif_segment(data)
    tiff = s0 + 10  # after FFE1, length, "Exif\0\0"
    buf = bytearray(data)
    order = {b"MM": "big", b"II": "little"}[bytes(buf[tiff : tiff + 2])]

    def u(off: int, n: int) -> int:
        return int.from_bytes(buf[tiff + off : tiff + off + n], order)

    ifd0 = u(4, 4)
    count = u(ifd0, 2)
    entries = [bytes(buf[tiff + ifd0 + 2 + 12 * k : tiff + ifd0 + 14 + 12 * k]) for k in range(count)]
    next_ifd = bytes(buf[tiff + ifd0 + 2 + 12 * count : tiff + ifd0 + 6 + 12 * count])
    gps = [e for e in entries if int.from_bytes(e[:2], order) == GPS_TAG]
    if not gps:
        return data
    gps_off = int.from_bytes(gps[0][8:12], order)

    # Zero the GPS IFD and its out-of-line values.
    gcount = u(gps_off, 2)
    spans = [(gps_off, 2 + 12 * gcount + 4)]
    for k in range(gcount):
        e = gps_off + 2 + 12 * k
        size = TYPE_SIZES.get(u(e + 2, 2), 1) * u(e + 4, 4)
        if size > 4:
            spans.append((u(e + 8, 4), size))
    for off, n in spans:
        if tiff + off + n > e0:
            raise RuntimeError("GPS data outside the Exif segment")
        buf[tiff + off : tiff + off + n] = bytes(n)

    # Rewrite IFD0 without the GPS pointer.
    kept = [e for e in entries if e is not gps[0]]
    block = (len(kept)).to_bytes(2, order) + b"".join(kept) + next_ifd + bytes(12)
    buf[tiff + ifd0 : tiff + ifd0 + len(block)] = block
    stored = bytes(buf)

    # Verify: same size, only the Exif segment changed, and it lost nothing but GPS.
    if len(stored) != len(data) or data[:s0] != stored[:s0] or data[e0:] != stored[e0:]:
        raise RuntimeError("bytes outside the Exif segment changed")
    before, after = piexif.load(data), piexif.load(stored)
    if after["GPS"] or GPS_TAG in after["0th"]:
        raise RuntimeError("GPS still present")
    before["GPS"] = {}
    before["0th"].pop(GPS_TAG)
    if before != after:
        raise RuntimeError("non-GPS EXIF changed")
    return stored


def text(v: object) -> str:
    if isinstance(v, bytes):
        return v.decode("utf-8", "replace").strip("\x00 ").strip()
    return str(v or "").strip()


def describe(stored: bytes) -> dict:
    exif = piexif.load(stored)
    with Image.open(io.BytesIO(stored)) as im:
        width, height = im.size
    taken = text(exif["Exif"].get(piexif.ExifIFD.DateTimeOriginal))
    taken_at = None
    if taken:
        date, _, time = taken.partition(" ")
        taken_at = f"{date.replace(':', '-')}T{time}"
        offset = text(exif["Exif"].get(piexif.ExifIFD.OffsetTimeOriginal))
        if offset:
            taken_at += offset
    make = text(exif["0th"].get(piexif.ImageIFD.Make))
    model = text(exif["0th"].get(piexif.ImageIFD.Model))
    device = model if model.lower().startswith(make.lower()) else f"{make} {model}".strip()
    return {"width": width, "height": height, "takenAt": taken_at, "device": device or None}


def find_photo(name: str, dirs: list[Path]) -> Path:
    for d in dirs:
        p = d / name
        if p.is_file():
            return p
    raise FileNotFoundError(f"{name} not found in {', '.join(map(str, dirs))}")


def stem_jpg(s: str) -> str:
    s = s.strip()
    return s if s.lower().endswith((".jpg", ".jpeg")) else f"{s}.jpg"


def write_if_changed(path: Path, data: bytes) -> None:
    if path.is_file() and path.read_bytes() == data:
        return
    path.write_bytes(data)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--source", required=True)
    ap.add_argument("--photos", action="append", required=True, type=Path)
    ap.add_argument("--duplicates", type=Path)
    ap.add_argument("--rotate", type=int)
    args = ap.parse_args()

    source = args.source
    cards = json.loads((SOURCES_DIR / f"{source}.json").read_text())["cards"]
    rotate = args.rotate if args.rotate is not None else DEFAULT_ROTATE.get(source)
    if rotate is None or rotate % 90:
        sys.exit(f"--rotate (0/90/180/270) is required for {source}")
    dirs = [d.expanduser() for d in args.photos]

    dups: dict[str, list[str]] = {}
    if args.duplicates:
        for line in args.duplicates.read_text().splitlines():
            cols = line.split("\t")
            if len(cols) >= 2 and cols[0].strip():
                dups.setdefault(stem_jpg(cols[1]), []).append(stem_jpg(cols[0]))
    images = {c["image"] for c in cards}
    unknown = [k for k in dups if k not in images]
    if unknown:
        sys.exit(f"duplicates point at photos no card uses: {unknown}")

    out_dir = ARCHIVE / "photos" / source
    out_dir.mkdir(parents=True, exist_ok=True)
    written: set[str] = set()

    def store(name: str, file_name: str) -> tuple[dict, bytes]:
        original = find_photo(name, dirs).read_bytes()
        stored = strip_gps(original)
        write_if_changed(out_dir / file_name, stored)
        written.add(file_name)
        entry = {
            "file": f"photos/{source}/{file_name}",
            "originalName": name,
            "sha256Original": sha256(original),
            "sha256Stored": sha256(stored),
        }
        return entry, stored

    entries = []
    for card in cards:
        cid = card["id"]
        main_entry, stored = store(card["image"], f"{cid}.jpg")
        duplicates = [
            store(name, f"{cid}.dup{n}.jpg")[0]
            for n, name in enumerate(sorted(dups.get(card["image"], [])), start=1)
        ]
        entries.append(
            {
                "card": cid,
                **main_entry,
                "bytes": len(stored),
                **describe(stored),
                "rotate": rotate % 360,
                "duplicates": duplicates,
            }
        )

    for stale in out_dir.iterdir():
        if stale.name not in written:
            stale.unlink()

    manifest_dir = ARCHIVE / "manifest"
    manifest_dir.mkdir(parents=True, exist_ok=True)
    body = json.dumps({"source": source, "cards": entries}, indent=2, ensure_ascii=False) + "\n"
    write_if_changed(manifest_dir / f"{source}.json", body.encode())
    total = sum((out_dir / f).stat().st_size for f in written)
    print(
        f"{source}: {len(entries)} cards, {len(written) - len(entries)} duplicates, "
        f"{total / 1e6:.1f} MB"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
