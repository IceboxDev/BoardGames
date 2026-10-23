#!/usr/bin/env python3
"""Build ~/Downloads/quiz-cards/validation-report.md from the coordinator's state files."""
import json, os, re, sys, glob, datetime

S = os.path.dirname(os.path.abspath(__file__))
OUT_ROOT = "/home/mantas/Downloads/quiz-cards"
J = os.path.join(OUT_ROOT, "json")

images = [l.strip() for l in open(os.path.join(S, "images.txt")) if l.strip()]
max_index = int(open(os.path.join(S, "max_index.txt")).read().strip())
log = {}
for line in open(os.path.join(S, "validation_log.md")):
    m = re.match(r"^(IMG\d+): (.*)$", line.strip())
    if m:
        log[m.group(1)] = m.group(2)
check = {}
for line in open(os.path.join(S, "check_all.txt")):
    m = re.match(r"^(PASS|FAIL) .*?/(IMG\d+)\.json", line.strip())
    if m:
        check[m.group(2)] = m.group(1)

dups = {}
dp = os.path.join(S, "duplicates.tsv")
if os.path.exists(dp):
    for line in open(dp):
        a, b, kind = line.rstrip("\n").split("\t")
        dups[a] = b
rows = []
produced = passed = reviewed = 0
for i, fn in enumerate(images, 1):
    stem = fn.rsplit(".", 1)[0]
    if i > max_index:
        break
    if stem in dups:
        rows.append((i, stem, f"duplicate of {dups[stem]}", "—", "—"))
        continue
    has = os.path.exists(os.path.join(J, stem + ".json"))
    chk = check.get(stem, "—" if not has else "not run")
    rev = log.get(stem, "—")
    if has:
        produced += 1
    if chk == "PASS":
        passed += 1
    if rev.startswith("OK"):
        reviewed += 1
    rows.append((i, stem, "done" if has else "missing", chk, rev))

fixes = [(s, r) for s, r in log.items() if not re.fullmatch(r"OK( \(all 60 Q/A checked\))?", r)]

# worker notes and coordinator notes straight from the JSONs
coord_notes, worker_notes = [], []
for f in sorted(glob.glob(J + "/*.json")):
    stem = os.path.basename(f)[:-5]
    d = json.load(open(f))
    for s in d["sets"]:
        n = s.get("notes", "").strip()
        if not n:
            continue
        if "[coordinator]" in n:
            coord_notes.append((stem, s["n"], s["category_en"], n))
        worker_notes.append((stem, s["n"], s["category_en"], n))

untouched = images[max_index:]
unique_total = min(max_index, len(images)) - len(dups)
today = datetime.date.today().isoformat()

L = []
L.append("# Quiz cards — validation report\n")
L.append(f"Generated {today}. Source photos: `/home/mantas/Downloads/Photos-1-001 (2)` ({len(images)} files). ")
if max_index < len(images):
    L.append(f"Processing was capped at the first **{max_index}** images on request; images #{max_index + 1}–#{len(images)} were not processed.\n")
else:
    L.append(f"All {len(images)} photos were examined; {len(dups)} of them are duplicate shots of another photo and were skipped, leaving **{unique_total} unique cards**.\n")
L.append("## Summary\n")
L.append(f"- Cards produced: **{produced}/{unique_total}** unique cards (`json/<stem>.json`, rendered to `md/<stem>.md`, index in `INDEX.md`).")
L.append(f"- Automatic checks passed: **{passed}/{produced}** (schema, 12 sets in canonical category order, 5 questions per set with the card's question first, "
         "every `answer_en` verbatim in `article_en` and every `answer_de` in `article_de`, distinct answers per set, article length 250–800 words).")
L.append(f"- Coordinator read-through completed: **{reviewed}/{produced}** cards — for every one of the 60 questions per card: DE and EN ask the same thing, "
         "the answer is factually correct, and the four siblings share the original's sub-topic and question form.")
if dups:
    L.append(f"- Duplicate photos: {len(dups)} (same card photographed twice — found by transcribing the top-left question of every unprocessed photo and fuzzy-matching it against the processed cards and each other; listed below). No duplicates among the processed cards themselves.")
else:
    L.append(f"- Duplicate cards (same first question on two photos): none among the {produced} processed cards.")
L.append(f"- Corrections made by the coordinator: {len(fixes)} cards (listed below). Everything else was accepted as delivered.\n")

if dups:
    L.append("## Duplicate photos (skipped)\n")
    L.append("| Photo | Same card as |")
    L.append("|---|---|")
    for a, b in sorted(dups.items()):
        L.append(f"| {a} | {b} |")
    L.append("")
L.append("## Corrections made during validation\n")
L.append("| Card | What was changed |")
L.append("|---|---|")
for s, r in sorted(fixes):
    L.append(f"| {s} | {r.replace('OK (', '').rstrip(')')} |")
L.append("")
L.append("Punctuation restoration: an early version of the self-check demanded a trailing `?`, so a few workers altered the card's own punctuation "
         "(imperatives such as „Nenne …“ ending in a full stop, a `?` placed inside the closing quote, or a `?` appended after a closing quote). "
         "The check was relaxed and the 13 affected originals were restored verbatim from the photos; each such set carries a "
         "`[coordinator] card punctuation restored verbatim.` note. The English translations of those imperatives were aligned to end in a full stop as well.\n")

L.append("## Items to be aware of (not errors)\n")
L.append("Workers recorded a `notes` entry on a set whenever the card itself is ambiguous, misspelt or dated, when several answers are acceptable, or when a "
         f"category was assigned purely by position although the content reads like another category. There are {len(worker_notes)} such notes on "
         f"{len(set(w[0] for w in worker_notes))} cards; all of them are kept verbatim in the JSON and Markdown next to the set. Grouped here:\n")
TYPO = ("misspell", "misspelt", "spells", "spelling", "typo")
POS = ("Position", "position", "positional", "quadrant")
PREM = ("predates", "card says", "card literally", "card's", "card text", "card wording", "card uses", "card asks", "card prints", "card writes",
        "card attributes", "Strictly", "strictly", "card describes", "card claims", "card states", "The card", "the card")
typo, pos, prem, alt = [], [], [], []
for w in worker_notes:
    n = w[3]
    if any(k in n for k in TYPO):
        typo.append(w)
    elif any(k in n for k in POS):
        pos.append(w)
    elif any(k in n for k in PREM):
        prem.append(w)
    else:
        alt.append(w)
L.append(f"### Misprints on the cards ({len(typo)})\n")
L.append("Transcribed verbatim in `de`; the English translation and the siblings use the correct form.\n")
for stem, n, cat, note in typo:
    L.append(f"- **{stem}** set {n} ({cat}): {note}")
L.append("")
L.append(f"### Card premise dated, imprecise or open to more than one reading ({len(prem)})\n")
for stem, n, cat, note in prem:
    L.append(f"- **{stem}** set {n} ({cat}): {note}")
L.append("")
L.append(f"### Category assigned by position although the content reads like another category ({len(pos)})\n")
L.append("Position on the card decides the category (as specified); the worker kept it and wrote the sibling questions in the card's sub-topic.\n")
L.append(", ".join(f"{stem} set {n}" for stem, n, cat, note in pos) + "\n")
L.append(f"### Alternative answers accepted / other remarks ({len(alt)})\n")
L.append("Mostly \"any N of …\" questions where the listed answer is one canonical selection, spelling variants (e.g. Mudschaheddin/Mudschahidin), "
         "or the German title vs. the original title. See the `notes` field of the set.\n")
L.append(", ".join(f"{stem} set {n}" for stem, n, cat, note in alt) + "\n")
kept = len(typo) + len(prem)

L.append("## Per-card status\n")
L.append("| # | Card | Produced | Auto-check | Coordinator review |")
L.append("|---|---|---|---|---|")
for i, stem, st, chk, rev in rows:
    L.append(f"| {i} | {stem} | {st} | {chk} | {rev} |")
L.append("")

if untouched:
    L.append(f"## Not processed (cap at {max_index})\n")
    L.append(f"{len(untouched)} images, #{max_index + 1}–#{len(images)}: " + ", ".join(u.rsplit('.', 1)[0] for u in untouched) + "\n")

L.append("## How the cards were produced\n")
L.append("One background agent per photo. Each agent rotated the photo 90° left with ImageMagick, read the full card plus three overlapping band crops "
         "with vision (no OCR engine is installed), transcribed the 12 German questions verbatim, mapped them to the 12 categories by position "
         "(pink/blue/sand band × TL/TR/BL/BR quadrant), translated them, wrote four sibling questions per original in the same form and sub-topic, "
         "answered all five in German and English, wrote a ~400–600-word English article containing all five answers verbatim and translated it into German "
         "containing all five German answers verbatim, then ran the self-check until it passed. A handful of cards were rerun on Sonnet after Opus's "
         "output filter rejected them; one batch was relaunched after an overnight usage-limit stop, and 13 workers of the second run were cut off by a session-limit reset on 2026-09-17 and relaunched the same evening (they reused their rotated images and any verified fragments; two of them had already written a passing JSON, which the coordinator reviewed and finished directly). Nothing was committed or pushed.\n")

open(os.path.join(OUT_ROOT, "validation-report.md"), "w").write("\n".join(L))
print(f"report: produced={produced} passed={passed} reviewed={reviewed} fixes={len(fixes)} notes_kept={kept} untouched={len(untouched)}")
