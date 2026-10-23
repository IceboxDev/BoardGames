"""Shared near-duplicate test for timeline events (dedupe pass 2).

Two events are the same fact when they have the same (start, end) and either
their EN labels overlap strongly (Jaccard >= 0.34 on content words) or the
date is day/month-precise and the labels share any content word.
"""
from __future__ import annotations

import re
import unicodedata

STOP = {
    "first", "published", "opens", "premieres", "becomes", "founded", "begins",
    "with", "from", "into", "their", "the", "and", "for", "that", "this", "released",
    "is", "are", "his", "her", "its",
}


def toks(s: str) -> set[str]:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return {w for w in re.findall(r"[a-z0-9]{4,}", s)} - STOP


def same_fact(a: dict, b: dict) -> bool:
    if (a["start"], a["end"]) != (b["start"], b["end"]):
        return False
    ta, tb = toks(a["label_en"]), toks(b["label_en"])
    if a["label_en"].strip().lower() == b["label_en"].strip().lower():
        return True
    if not ta or not tb:
        return False
    if len(ta & tb) / len(ta | tb) >= 0.34:
        return True
    return a["precision"] in ("day", "month") and bool(ta & tb)
