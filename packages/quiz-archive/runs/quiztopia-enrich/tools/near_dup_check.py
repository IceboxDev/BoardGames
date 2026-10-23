#!/usr/bin/env python3
"""Fail questions whose timeline event is the SAME FACT as another question's.

Usage: near_dup_check.py c001 c002 … | IMG… | --all

"Same fact" = tools/near_dup_lib.same_fact: same (start, end) plus strongly
overlapping labels (or any shared word for day/month-precise dates). Checked
against the whole corpus. Questions on tools/dedupe2_worklist.json must also
no longer carry their old event. A keeper whose only matches are worklist
questions still waiting for another unit is skipped. Exit 1 on any hit.
"""

from __future__ import annotations

import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from enrich_check import JSON_DIR, resolve, stems  # noqa: E402
from near_dup_lib import same_fact  # noqa: E402

WORKLIST = Path(__file__).resolve().parent / "dedupe2_worklist.json"


def main() -> None:
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    all_stems = stems()
    wanted = set(resolve(args))
    events: dict[str, dict] = {}
    by_dates: dict[tuple, list[str]] = collections.defaultdict(list)
    for ci, stem in enumerate(all_stems, start=1):
        card = json.loads((JSON_DIR / f"{stem}.json").read_text())
        for si, s in enumerate(card["sets"], start=1):
            for qi, q in enumerate(s["questions"]):
                qid = f"c{ci:03d}s{si:02d}q{qi}"
                t = q["timeline"]
                events[qid] = t
                by_dates[(t["start"], t["end"])].append(qid)
    worklist = json.loads(WORKLIST.read_text()) if WORKLIST.exists() else []
    old = {w["id"]: w["old_event"] for w in worklist}

    def pending(qid: str) -> bool:
        """A worklist question another unit has not re-pinned yet."""
        o = old.get(qid)
        t = events[qid]
        return o is not None and (t["start"], t["end"], t["label_en"]) == (o["start"], o["end"], o["label_en"])

    failed = 0
    for ci, stem in enumerate(all_stems, start=1):
        if stem not in wanted:
            continue
        cid = f"c{ci:03d}"
        errs = []
        for qid, t in events.items():
            if not qid.startswith(cid):
                continue
            if qid in old and pending(qid):
                errs.append(f"{qid[4:]}: still carries its old event „{t['label_en']}“")
                continue
            twins = [o for o in by_dates[(t["start"], t["end"])] if o != qid and same_fact(t, events[o])]
            if not twins:
                continue
            if qid not in old and all(pending(o) for o in twins):
                continue  # a keeper waiting on other units
            errs.append(
                f"{qid[4:]}: same fact as {', '.join(twins)} — „{t['label_en']}“ ({t['start']}{'–' + t['end'] if t['end'] else ''})"
            )
        todo = sum(1 for w in worklist if w["card"] == cid)
        print(f"{'PASS' if not errs else 'FAIL'} {cid} {stem} (worklist: {todo})" + (f" ({len(errs)})" if errs else ""))
        for e in errs:
            print(f"   {e}")
        failed += bool(errs)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
