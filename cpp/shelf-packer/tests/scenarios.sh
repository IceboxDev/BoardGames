#!/usr/bin/env bash
# End-to-end checks of the CLI on a tiny problem (tests/scenarios/): every
# packing run is re-checked with --verify, every group flag is exercised,
# stale library columns are rejected, and every input error exits 2.
# Usage: tests/scenarios.sh path/to/shelf-packer
set -uo pipefail

BIN=$(realpath "$1")
HERE=$(cd "$(dirname "$0")" && pwd)
BOXES="$HERE/scenarios/boxes.csv"
LIBRARY="$HERE/scenarios/library.txt"
GEO=(--width 300 --height 100 --over-left 10 --over-right 10 --over-top 15)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
failures=0

# expect NAME STATUS PATTERN -- COMMAND…   PATTERN (ERE) must appear in the
# command's stdout+stderr; an empty PATTERN matches anything.
expect() {
  local name=$1 status=$2 pattern=$3
  shift 4
  local out rc=0
  out=$("$@" 2>&1) || rc=$?
  if [[ $rc -ne $status ]]; then
    echo "  FAIL $name: exit $rc, wanted $status"
    tail -n 5 <<<"$out" | sed 's/^/       /'
    failures=$((failures + 1))
  elif [[ -n $pattern ]] && ! grep -qE -- "$pattern" <<<"$out"; then
    echo "  FAIL $name: output lacks /$pattern/"
    tail -n 5 <<<"$out" | sed 's/^/       /'
    failures=$((failures + 1))
  else
    echo "  ok   $name"
  fi
}

packer() { "$BIN" "$BOXES" "${GEO[@]}" "$@"; }

# Every packing in DIR/packings.txt places all of the given boxes.
every_packing_places() {
  local dir=$1
  shift
  awk -v want="$*" '
    function check() { for (i = 1; i <= n; i++) if (!(names[i] in got)) bad = 1 }
    BEGIN { n = split(want, names, " ") }
    /^packing/ { if (open) check(); open = 1; split("", got) }
    /^place/ { got[$3] = 1 }
    END { if (open) check(); exit bad }' "$dir/packings.txt"
}

echo "packing runs (each re-checked by --verify)"
expect "single shelf" 0 "wrote [0-9]+ packings" -- packer --depth-max 200 --out "$T/single"
expect "  verifies" 0 " 0 problems" -- packer --depth-max 200 --verify "$T/single"
expect "--pair is mandatory" 0 "wrote" -- packer --depth-max 200 --pair small-a,small-b --out "$T/pair"
expect "  verifies" 0 " 0 problems" -- packer --depth-max 200 --pair small-a,small-b --verify "$T/pair"
expect "  every packing places both" 0 "" -- every_packing_places "$T/pair" small-a small-b
expect "  an impossible pair names the box that fits nowhere" 1 "in no legal pile.*: tall" -- \
  packer --depth-max 200 --pair small-a,tall --out "$T/pair-impossible"
expect "--stack" 0 "wrote" -- packer --depth-max 200 --stack alpha,beta --out "$T/stack"
expect "  verifies" 0 " 0 problems" -- packer --depth-max 200 --stack alpha,beta --verify "$T/stack"
expect "--requires" 0 "wrote" -- packer --depth-max 200 --requires small-a,small-b --out "$T/req"
expect "  verifies" 0 " 0 problems" -- packer --depth-max 200 --requires small-a,small-b --verify "$T/req"
FILL=(--fill-all --shelf 200 --shelf 200)
expect "--fill-all, two shelves" 0 "holes in windows" -- packer "${FILL[@]}" --out "$T/fill"
expect "  verifies" 0 " 0 problems" -- packer "${FILL[@]}" --verify "$T/fill"
expect "--vert-inside" 0 "wrote" -- packer --depth-max 200 --vert-inside --out "$T/vi"
expect "  verifies" 0 " 0 problems" -- packer --depth-max 200 --vert-inside --verify "$T/vi"
expect "--use-all that cannot fit exits 1 and explains" 1 "best attempt placed" -- \
  packer --depth-max 200 --use-all --out "$T/useall"

echo "verify catches a tampered file"
cp -r "$T/single" "$T/tampered"
awk '!done && /^place/ { $5 += 3; done = 1 } { print }' "$T/single/packings.txt" \
  >"$T/tampered/packings.txt"
expect "a lifted box" 1 "floats 3 mm" -- packer --depth-max 200 --verify "$T/tampered"
expect "verify judges by the flags given" 1 "--use-all: not every box is placed" -- \
  packer --depth-max 200 --use-all --verify "$T/single"

echo "warm start and library"
expect "--warm from a run" 0 "warm .*: [0-9]+ read" -- packer --depth-max 200 --warm "$T/single" \
  --out "$T/warm"
mkdir -p "$T/empty"
expect "--warm without packings.txt" 2 "no packings.txt" -- packer --depth-max 200 \
  --warm "$T/empty" --out "$T/warm2"
expect "library columns checked on load" 0 "3 read, 2 piles on shelf A" -- \
  packer --depth-max 200 --library "$LIBRARY" --piles-only
expect "  unknown box rejected" 0 "unknown box 'nosuch'" -- \
  packer --depth-max 200 --library "$LIBRARY" --piles-only
expect "  --flat rejects a standing column" 0 "small-a 25x100 d120 is not a legal orientation" -- \
  packer --depth-max 200 --flat --library "$LIBRARY" --piles-only
sed 's/^alpha,150,180,50$/alpha,149,180,50/' "$BOXES" >"$T/remeasured.csv"
expect "  a re-measured box's columns are rejected" 0 \
  "alpha 150x50 d180 is not a legal orientation" -- \
  "$BIN" "$T/remeasured.csv" "${GEO[@]}" --depth-max 200 --library "$LIBRARY" --piles-only
expect "library written after a run" 0 "wrote" -- packer --depth-max 200 --library "$T/new.lib" \
  --out "$T/lib"
expect "  with its header" 0 "column library v1" -- head -n 1 "$T/new.lib"

echo "input errors exit 2"
expect "flag without its value" 2 "--out needs a value" -- packer --out
expect "unknown flag" 2 "unknown flag --flatt" -- "$BIN" --flatt "$BOXES"
expect "not a number" 2 "not a whole number" -- packer --width abc
expect "pattern matching nothing" 2 "matches no box" -- packer --require nosuch
expect "--fill-all without shelves" 2 "needs its shelves" -- packer --fill-all
expect "missing csv" 2 "cannot open" -- "$BIN" "$T/nope.csv"
expect "--help" 0 "usage: shelf-packer" -- "$BIN" --help

if [[ $failures -gt 0 ]]; then
  echo "$failures scenario checks failed"
  exit 1
fi
echo "all scenario checks passed"
