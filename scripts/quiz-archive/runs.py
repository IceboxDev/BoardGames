#!/usr/bin/env python3
"""Archive quiz work into packages/quiz-archive/ (transcripts + runs).

Run with `python3 -I scripts/quiz-archive/runs.py <command> ...` from the repo root.

  run          archive one work folder as runs/<id>/ with a run.json
  transcripts  copy every printed-card transcription into transcripts/<source>/<card>.json
  check        every card in content/sources/*.json has a transcript; every run has a run.json
  refmap       write runs/ref-map.json: old Downloads-relative history `ref` -> archive path

`run` copies text artefacts only (json, jsonl, md, txt, tsv, py, sh, csv, html is NOT copied) and skips
the bulky/derived parts by default: scratch*/ folders, staged/ bank snapshots, __pycache__, images,
PDFs and fetched page text. Add --include/--exclude globs (matched against the path relative to the
work folder) to adjust. Files are copied byte for byte. See packages/quiz-archive/RUNS.md.
"""

from __future__ import annotations

import argparse
import fnmatch
import glob
import hashlib
import json
import os
import shutil
import sys
from collections import Counter
from datetime import datetime, timezone

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ARCHIVE = os.path.join(REPO, "packages", "quiz-archive")
CONTENT = os.path.join(REPO, "packages", "core", "src", "quiz", "content")

TEXT_EXT = {".json", ".jsonl", ".md", ".txt", ".tsv", ".py", ".sh", ".csv", ".ids"}
DEFAULT_EXCLUDE = [
    "scratch*", "*/scratch*", "staged", "staged/*", "*/staged/*", "*__pycache__*",
    "num/*", "*.png", "*.jpg", "*.jpeg", "*.pdf", "*.pyc", "*.raw", "*.html",
]
KINDS = ["ingest", "enrich", "research", "rebalance", "rework", "dedupe", "split", "import"]


def _excluded(rel: str, patterns: list[str]) -> bool:
    parts = rel.split("/")
    for p in patterns:
        if fnmatch.fnmatch(rel, p):
            return True
        # a pattern without a slash also matches any single path component (a folder name)
        if "/" not in p and any(fnmatch.fnmatch(part, p) for part in parts[:-1]):
            return True
    return False


def _write_json(path: str, data: object) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, path)


def _home(path: str) -> str:
    path = os.path.abspath(os.path.expanduser(path))
    home = os.path.expanduser("~")
    return "~" + path[len(home):] if path.startswith(home + os.sep) else path


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts).astimezone().isoformat(timespec="minutes")


def collect(src: str, includes: list[str], excludes: list[str]) -> list[str]:
    """Paths (relative to src) the run archives."""
    out = []
    for root, dirs, files in os.walk(src):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(root, name)
            rel = os.path.relpath(full, src).replace(os.sep, "/")
            if includes and not any(fnmatch.fnmatch(rel, p) for p in includes):
                continue
            if _excluded(rel, excludes):
                continue
            if os.path.splitext(name)[1].lower() not in TEXT_EXT and not includes:
                continue
            out.append(rel)
    return out


def cmd_run(a: argparse.Namespace) -> None:
    if a.kind not in KINDS:
        sys.exit(f"--kind must be one of {KINDS}")
    dest = os.path.join(ARCHIVE, "runs", a.id)
    if os.path.exists(os.path.join(dest, "run.json")) and not a.update:
        sys.exit(f"runs/{a.id} exists; pass --update to add to it")
    copied: list[str] = []
    mtimes: list[float] = []
    for spec in a.src:
        # SRC or SRC=PREFIX (files land under PREFIX/ inside the run)
        src, _, prefix = spec.partition("=")
        src = os.path.expanduser(src)
        if os.path.isfile(src):
            files = [(src, os.path.basename(src))]
        else:
            files = [(os.path.join(src, r), r) for r in collect(src, a.include, DEFAULT_EXCLUDE + a.exclude)]
        for full, rel in files:
            target_rel = f"{prefix}/{rel}" if prefix else rel
            target = os.path.join(dest, target_rel)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            shutil.copy2(full, target)
            copied.append(target_rel)
            mtimes.append(os.path.getmtime(full))
    meta: dict = {}
    if a.meta:
        with open(a.meta, encoding="utf-8") as f:
            meta = json.load(f)
    prev: dict = {}
    if a.update and os.path.exists(os.path.join(dest, "run.json")):
        with open(os.path.join(dest, "run.json"), encoding="utf-8") as f:
            prev = json.load(f)
    all_files = sorted(
        os.path.relpath(p, dest).replace(os.sep, "/")
        for p in glob.glob(os.path.join(dest, "**", "*"), recursive=True)
        if os.path.isfile(p) and not p.endswith("run.json")
    )
    by_ext = Counter(os.path.splitext(f)[1] or "(none)" for f in all_files)
    size = sum(os.path.getsize(os.path.join(dest, f)) for f in all_files)
    run = {
        "id": a.id,
        "title": a.title or prev.get("title") or a.id,
        "startedAt": a.started or prev.get("startedAt") or (_iso(min(mtimes)) if mtimes else None),
        "endedAt": a.ended or prev.get("endedAt") or (_iso(max(mtimes)) if mtimes else None),
        "kind": a.kind,
        "by": a.by or prev.get("by") or [],
        "brief": a.brief or prev.get("brief"),
        "inputs": a.input or prev.get("inputs") or [],
        "outputs": a.output or prev.get("outputs") or [],
        "archivedFrom": sorted(set(prev.get("archivedFrom", []) + [_home(s.partition("=")[0]) for s in a.src])),
        "archivedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="minutes"),
        "counts": {**prev.get("counts", {}), "files": len(all_files), "bytes": size, "byExt": dict(sorted(by_ext.items()))},
        "notes": a.notes or prev.get("notes") or "",
    }
    for k, v in meta.items():
        if k == "counts":
            run["counts"].update(v)
        else:
            run[k] = v
    _write_json(os.path.join(dest, "run.json"), run)
    print(f"runs/{a.id}: {len(copied)} files copied, {len(all_files)} in run, {size / 1e6:.2f} MB")


# ---------------------------------------------------------------- transcripts

def _reserialise(src: str, dest: str) -> None:
    with open(src, encoding="utf-8") as f:
        data = json.load(f)
    _write_json(dest, data)
    with open(dest, encoding="utf-8") as f:
        if json.load(f) != data:
            sys.exit(f"round-trip mismatch {src}")


def cmd_transcripts(a: argparse.Namespace) -> None:
    dl = os.path.expanduser(a.downloads)
    out = os.path.join(ARCHIVE, "transcripts")
    n = Counter()
    for source, pattern in [
        ("trivial-pursuit", "trivial-pursuit/printed/tp-*.json"),
        ("trivial-pursuit", "tp-221/printed/tp-*.json"),
        ("publish-or-perish", "publish-or-perish/printed/pp-*.json"),
        ("publish-or-perish-mge", "publish-or-perish-mge/printed/ppm-*.json"),
    ]:
        for p in sorted(glob.glob(os.path.join(dl, pattern))):
            _reserialise(p, os.path.join(out, source, os.path.basename(p)))
            n[source] += 1
    if a.quiztopia:
        # ws21's quiz-cards/json is keyed by photo name; content/sources/quiztopia.json maps photo -> card.
        with open(os.path.join(CONTENT, "sources", "quiztopia.json"), encoding="utf-8") as f:
            cards = json.load(f)["cards"]
        for c in cards:
            stem = os.path.splitext(c["image"])[0]
            p = os.path.join(os.path.expanduser(a.quiztopia), f"{stem}.json")
            if not os.path.exists(p):
                print(f"missing Quiztopia transcript for {c['id']} ({stem})")
                continue
            _reserialise(p, os.path.join(out, "quiztopia", f"{c['id']}.json"))
            n["quiztopia"] += 1
    if a.legacy:
        import subprocess

        legacy = 0
        for c in sorted(glob.glob(os.path.join(out, "quiztopia", "c[0-9][0-9][0-9].json"))):
            card = os.path.basename(c)[:-5]
            path = f"packages/core/src/games/quiztopia/content/questions/{card}.json"
            r = subprocess.run(["git", "-C", REPO, "show", f"{a.legacy}:{path}"], capture_output=True)
            if r.returncode:
                continue
            old = json.loads(r.stdout.decode("utf-8"))
            with open(c, encoding="utf-8") as f:
                new = json.load(f)
            # The legacy file is the converted shape the bank was first imported from. Keep it only when
            # it says something the ws21 transcript does not (every field, camelCased, equal => skip).
            if _legacy_is_subset(old, new):
                continue
            _write_json(os.path.join(out, "quiztopia", f"{card}.legacy.json"), old)
            legacy += 1
        n["quiztopia (legacy)"] = legacy
    for k, v in n.items():
        print(f"{k}: {v}")


def _camel(o: object) -> object:
    import re

    if isinstance(o, dict):
        return {re.sub(r"_([a-z])", lambda m: m.group(1).upper(), k): _camel(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_camel(x) for x in o]
    return o


def _legacy_is_subset(old: dict, new: dict) -> bool:
    """True when every legacy set/question field (bar its ids) equals the ws21 field of the same name."""
    new = _camel(new)
    if len(old.get("sets", [])) != len(new.get("sets", [])):
        return False
    for so, sn in zip(old["sets"], new["sets"]):
        if len(so["questions"]) != len(sn["questions"]):
            return False
        for k, v in so.items():
            if k not in ("id", "questions", "notesEn", "notesDe") and sn.get(k) != v:
                return False
            if k in ("notesEn", "notesDe") and v and sn.get(k) != v:
                return False
        for qo, qn in zip(so["questions"], sn["questions"]):
            if any(k != "id" and qn.get(k) != v for k, v in qo.items()):
                return False
    return True


# ---------------------------------------------------------------- check / refmap

def cmd_check(_: argparse.Namespace) -> None:
    ok = True
    for p in sorted(glob.glob(os.path.join(CONTENT, "sources", "*.json"))):
        with open(p, encoding="utf-8") as f:
            src = json.load(f)
        missing = [c["id"] for c in src["cards"]
                   if not os.path.exists(os.path.join(ARCHIVE, "transcripts", src["source"], f"{c['id']}.json"))]
        print(f"{src['source']}: {len(src['cards']) - len(missing)}/{len(src['cards'])} transcripts")
        if missing:
            ok = False
            print("  missing:", " ".join(missing[:20]))
    for d in sorted(glob.glob(os.path.join(ARCHIVE, "runs", "*", ""))):
        if not os.path.exists(os.path.join(d, "run.json")):
            ok = False
            print(f"no run.json in {d}")
    rm = os.path.join(ARCHIVE, "runs", "ref-map.json")
    if os.path.exists(rm):
        with open(rm, encoding="utf-8") as f:
            m = json.load(f)
        bad = [new for new in m["map"].values() for part in new.split(" ")
               if not os.path.exists(os.path.join(ARCHIVE, part))]
        print(f"ref-map: {len(m['map'])} mapped, {len(m['unresolved'])} unresolved, {len(bad)} dangling targets")
        ok = ok and not bad
    print("CHECK:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


def _history_refs() -> Counter:
    refs: Counter = Counter()

    def walk(o: object) -> None:
        if isinstance(o, dict):
            for k, v in o.items():
                if k == "ref" and isinstance(v, str):
                    refs[v] += 1
                else:
                    walk(v)
        elif isinstance(o, list):
            for x in o:
                walk(x)

    for p in glob.glob(os.path.join(CONTENT, "history", "**", "*.json"), recursive=True):
        with open(p, encoding="utf-8") as f:
            walk(json.load(f))
    return refs


# How each historical ref prefix resolves. A ref is one or more space-separated paths.
# Every `decisions/` ref is dated 2026-10-20 (the Trivial Pursuit merge); PoP/MGE/tp-221 merges wrote none.
# Every bare `enrich-report/` ref is dated 2026-10-21 (Trivial Pursuit enrich, Downloads/quiz-cards/enrich-report).
def _resolve_one(ref: str) -> str | None:
    head, _, rest = ref.partition("/")
    if head == "printed" and rest.startswith("tp-"):
        return f"transcripts/trivial-pursuit/{rest}"
    if head == "quiztopia":
        return f"transcripts/quiztopia/{rest}.json"
    if head in ("publish-or-perish", "publish-or-perish-mge", "trivial-pursuit") and rest:
        return f"transcripts/{head}/{rest}.json"
    if head == "enrich-report":
        return f"runs/tp-enrich/enrich-report/{rest}"
    if head == "decisions":
        return f"runs/tp-ingest/decisions/{rest}"
    if ref == "dedupe-report.md":
        return "runs/tp-dedupe/dedupe-report.md"
    if ref == "handcheck/out":
        return "runs/handcheck-2026-10-23/out"
    for prefix, run in [("handcheck/", "handcheck-2026-10-23"), ("rework/", "rework-2026-10-23"),
                        ("rebalance/", "rebalance-2026-10-22"), ("one-question/", "one-question")]:
        if ref.startswith(prefix):
            return f"runs/{run}/{ref[len(prefix):]}"
    return None


def cmd_refmap(_: argparse.Namespace) -> None:
    refs = _history_refs()
    mapped, unresolved = {}, {}
    for ref in sorted(refs):
        parts = [_resolve_one(p) for p in ref.split()]
        if any(p is None for p in parts):
            unresolved[ref] = "no rule for this ref prefix"
            continue
        missing = [p for p in parts if not os.path.exists(os.path.join(ARCHIVE, p))]
        if missing:
            unresolved[ref] = "target not in archive: " + " ".join(missing)
            continue
        mapped[ref] = " ".join(parts)
    out = {
        "about": "History `ref` values (relative to ~/Downloads/quiz-cards at the time) -> path relative to "
                 "packages/quiz-archive/. A multi-file ref maps to the same number of space-separated paths.",
        "generatedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="minutes"),
        "distinctRefs": len(refs),
        "entries": sum(refs.values()),
        "map": mapped,
        "unresolved": unresolved,
    }
    _write_json(os.path.join(ARCHIVE, "runs", "ref-map.json"), out)
    print(f"{len(mapped)} mapped, {len(unresolved)} unresolved of {len(refs)} distinct refs ({sum(refs.values())} entries)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="archive a work folder as runs/<id>/")
    r.add_argument("--id", required=True)
    r.add_argument("--kind", required=True, help="|".join(KINDS))
    r.add_argument("--src", action="append", required=True,
                   help="folder or file to archive; SRC=PREFIX puts it under PREFIX/ (repeatable)")
    r.add_argument("--title")
    r.add_argument("--started")
    r.add_argument("--ended")
    r.add_argument("--by", action="append", default=[], help="agent/model/human description (repeatable)")
    r.add_argument("--brief", help="the brief file, relative to the run folder")
    r.add_argument("--input", action="append", default=[])
    r.add_argument("--output", action="append", default=[])
    r.add_argument("--include", action="append", default=[], help="only these globs (any extension)")
    r.add_argument("--exclude", action="append", default=[])
    r.add_argument("--notes")
    r.add_argument("--meta", help="JSON file merged into run.json (counts merge)")
    r.add_argument("--update", action="store_true", help="add to an existing run")
    r.set_defaults(fn=cmd_run)
    t = sub.add_parser("transcripts", help="import printed-card transcriptions")
    t.add_argument("--downloads", default="~/Downloads/quiz-cards")
    t.add_argument("--quiztopia", help="folder with ws21's quiz-cards/json (IMG*.json)")
    t.add_argument("--legacy", help="git rev holding games/quiztopia/content/questions (e.g. HEAD)")
    t.set_defaults(fn=cmd_transcripts)
    sub.add_parser("check").set_defaults(fn=cmd_check)
    sub.add_parser("refmap").set_defaults(fn=cmd_refmap)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
