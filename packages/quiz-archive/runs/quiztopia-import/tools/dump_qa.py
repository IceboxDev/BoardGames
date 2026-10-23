#!/usr/bin/env python3
"""Compact Q/A dump for review: dump_qa.py <json_dir> <stem> [<stem> ...]"""
import json
import sys

J = sys.argv[1]
for stem in sys.argv[2:]:
    d = json.load(open(f"{J}/{stem}.json", encoding="utf-8"))
    print(f"\n######## {stem}")
    for s in d["sets"]:
        print(f"\n## {s['n']} {s['category_en']}" + (f"   [notes: {s['notes']}]" if s.get("notes") else ""))
        for j, q in enumerate(s["questions"]):
            tag = "*" if q["original"] else str(j)
            print(f"{tag} DE: {q['de']}")
            print(f"  EN: {q['en']}")
            print(f"  A:  {q['answer_de']}  |  {q['answer_en']}")
