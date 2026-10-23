#!/usr/bin/env python3
"""Fail questions whose timeline event is shared with another question.

Usage: dup_check.py c001 c002 … | IMG… | --all   (same card syntax as enrich_check.py)

An event is identified by (start, end, label_en lower-cased). For every
question on the given cards, the event must be unique across the WHOLE
corpus. Questions listed in tools/dedupe_worklist.json must also no longer
carry their old (shared) event. Exit code 1 on any hit.
"""

from __future__ import annotations

import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from enrich_check import JSON_DIR, resolve, stems  # noqa: E402

WORKLIST = Path(__file__).resolve().parent / "dedupe_worklist.json"


def key(t: dict) -> tuple:
    return (t["start"], t["end"], t["label_en"].strip().lower())


def main() -> None:
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    all_stems = stems()
    wanted = set(resolve(args))
    owners: dict[tuple, list[str]] = collections.defaultdict(list)
    events: dict[str, tuple] = {}
    for ci, stem in enumerate(all_stems, start=1):
        card = json.loads((JSON_DIR / f"{stem}.json").read_text())
        for si, s in enumerate(card["sets"], start=1):
            for qi, q in enumerate(s["questions"]):
                qid = f"c{ci:03d}s{si:02d}q{qi}"
                t = q.get("timeline")
                if not isinstance(t, dict):
                    continue
                k = key(t)
                owners[k].append(qid)
                events[qid] = k
    worklist = json.loads(WORKLIST.read_text()) if WORKLIST.exists() else []
    old = {w["id"]: (w["old_event"]["start"], w["old_event"]["end"], w["old_event"]["label_en"]) for w in worklist}

    failed = 0
    for ci, stem in enumerate(all_stems, start=1):
        if stem not in wanted:
            continue
        card_id = f"c{ci:03d}"
        errs = []
        for qid, k in events.items():
            if not qid.startswith(card_id):
                continue
            others = [o for o in owners[k] if o != qid]
            # A keeper only shares with questions another unit still has to
            # re-pin (all of them on the worklist): not this unit's problem.
            if others and qid not in old and all(o in old and events[o] == old[o] for o in others):
                continue
            if others:
                errs.append(f"{qid[4:]}: event shared with {', '.join(others)} — „{k[2]}“ ({k[0]}{'–' + k[1] if k[1] else ''})")
            elif qid in old and k == old[qid]:
                errs.append(f"{qid[4:]}: still carries its old shared event")
        todo = sum(1 for w in worklist if w["card"] == card_id)
        print(f"{'PASS' if not errs else 'FAIL'} {card_id} {stem} (worklist: {todo})" + (f" ({len(errs)})" if errs else ""))
        for e in errs:
            print(f"   {e}")
        failed += bool(errs)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
