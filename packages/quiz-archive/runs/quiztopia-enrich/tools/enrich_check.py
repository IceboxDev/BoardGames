#!/usr/bin/env python3
"""Validate the timeline / source / notes enrichment of quiz-card JSON files.

Usage:
  enrich_check.py c001 c002 ...      (card index, 1-based in sorted stem order)
  enrich_check.py IMG20260910164837  (image stem)
  enrich_check.py --all

Prints one PASS/FAIL line per card, followed by the problems of failing cards.
Exit code 1 when any card fails.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JSON_DIR = ROOT / "json"
BASE_DIR = ROOT / "json.bak-2026-09-24"
REPORT_DIR = ROOT / "enrich-report"

KINDS = {"event", "lifespan", "period", "reign", "creation", "founding", "discovery", "era"}
PRECISIONS = {"day", "month", "year", "decade", "century", "millennium", "megayear"}
QUESTION_KEYS = {"original", "de", "en", "answer_de", "answer_en", "timeline", "source"}
TIMELINE_KEYS = {"kind", "start", "end", "precision", "approx", "ongoing", "label_en", "label_de"}
SOURCE_KEYS = {"url", "title", "lang"}
DATE_RE = re.compile(r"^(-?)(\d{1,11})(?:-(\d{2})(?:-(\d{2}))?)?$")
DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def stems() -> list[str]:
    return sorted(p.stem for p in JSON_DIR.glob("IMG*.json"))


def resolve(args: list[str]) -> list[str]:
    all_stems = stems()
    if args == ["--all"]:
        return all_stems
    out = []
    for a in args:
        m = re.fullmatch(r"c?(\d{1,3})", a)
        if m:
            out.append(all_stems[int(m.group(1)) - 1])
        elif a in all_stems:
            out.append(a)
        elif a.removesuffix(".json") in all_stems:
            out.append(a.removesuffix(".json"))
        else:
            raise SystemExit(f"unknown card: {a}")
    return out


def parse_date(s: str):
    """-> (year, month|None, day|None) with historical years (no year 0)."""
    m = DATE_RE.match(s)
    if not m:
        return None
    sign, y, mo, d = m.groups()
    year = int(y) * (-1 if sign else 1)
    if year == 0:
        return None
    month = int(mo) if mo else None
    day = int(d) if d else None
    if month is not None and not 1 <= month <= 12:
        return None
    if day is not None and not 1 <= day <= DAYS_IN_MONTH[month - 1]:
        return None
    return year, month, day


def sort_key(p) -> tuple:
    y, m, d = p
    return (y, m or 0, d or 0)


def fold(s: str) -> str:
    return s.casefold()


def found(article: str, answer: str) -> bool:
    return answer in article or fold(answer) in fold(article)


def ordinal_en(n: int) -> str:
    if 10 <= n % 100 <= 20:
        suf = "th"
    else:
        suf = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suf}"


def date_mentions(year: int, precision: str) -> tuple[list[str], list[str]]:
    """Acceptable spellings of a year in (EN, DE) article text."""
    a = abs(year)
    en, de = [str(a)], [str(a)]
    if a >= 1000:
        en.append(f"{a:,}")  # 1,000,000 style
        de.append(f"{a:,}".replace(",", "."))
    if precision == "decade":
        en += [f"{a}s", f"{a}’s", f"{a}'s"]
        de += [f"{a}er"]
    if precision in ("century", "decade") and a >= 100:
        # "1201" and "1200" both stand for the 13th century.
        for c in {(a - 1) // 100 + 1, a // 100 + 1}:
            en += [f"{ordinal_en(c)} century", f"{ordinal_en(c)}-century"]
            de += [f"{c}. Jahrhundert", f"{c}. Jh", f"{c}. Jahrhunderts"]
    if precision == "millennium":
        m = (a - 1) // 1000 + 1
        en += [f"{ordinal_en(m)} millennium"]
        de += [f"{m}. Jahrtausend", f"{m}. Jahrtausends"]
    if precision == "megayear" or a >= 100_000:
        for unit, scale_en, scale_de in ((1e9, "billion", "Milliarde"), (1e6, "million", "Million")):
            if a >= unit:
                v = f"{a / unit:g}"
                en.append(f"{v} {scale_en}")
                de.append(f"{v.replace('.', ',')} {scale_de}")
    return en, de


def mentions(article: str, options: list[str]) -> bool:
    for o in options:
        if o.isdigit():
            if re.search(rf"(?<!\d){re.escape(o)}(?!\d)", article):
                return True
        elif o.casefold() in article.casefold():
            return True
    return False


def check_timeline(tl, where: str, art_en: str, art_de: str, errs: list[str]) -> None:
    if not isinstance(tl, dict):
        errs.append(f"{where}: timeline missing")
        return
    keys = set(tl)
    if keys != TIMELINE_KEYS:
        errs.append(f"{where}: timeline keys {sorted(keys ^ TIMELINE_KEYS)} wrong")
        return
    if tl["kind"] not in KINDS:
        errs.append(f"{where}: kind {tl['kind']!r}")
    if tl["precision"] not in PRECISIONS:
        errs.append(f"{where}: precision {tl['precision']!r}")
    for k in ("approx", "ongoing"):
        if not isinstance(tl[k], bool):
            errs.append(f"{where}: {k} must be a boolean")
    for k in ("label_en", "label_de"):
        if not isinstance(tl[k], str) or not tl[k].strip():
            errs.append(f"{where}: {k} empty")
        elif len(tl[k]) > 140:
            errs.append(f"{where}: {k} longer than 140 chars")
    start = parse_date(tl["start"]) if isinstance(tl["start"], str) else None
    if not start:
        errs.append(f"{where}: bad start {tl['start']!r}")
        return
    parts = tl["start"].lstrip("-").count("-")
    want = {0: None, 1: "month", 2: "day"}[parts]
    if want and tl["precision"] != want:
        errs.append(f"{where}: start {tl['start']} needs precision {want}")
    if not want and tl["precision"] in ("day", "month"):
        errs.append(f"{where}: precision {tl['precision']} but start is a bare year")
    end = None
    if tl["end"] is not None:
        end = parse_date(tl["end"]) if isinstance(tl["end"], str) else None
        if not end:
            errs.append(f"{where}: bad end {tl['end']!r}")
            return
        if sort_key(end) <= sort_key(start):
            errs.append(f"{where}: end {tl['end']} not after start {tl['start']}")
    if tl["ongoing"] and tl["end"] is not None:
        errs.append(f"{where}: ongoing with an end")
    if tl["kind"] in ("lifespan", "period", "reign") and tl["end"] is None and not tl["ongoing"]:
        errs.append(f"{where}: {tl['kind']} needs an end (or ongoing: true)")
    # The dates must be in the article, in both languages.
    for label, p in (("start", start), ("end", end)):
        if p is None:
            continue
        prec = tl["precision"] if label == "start" else ("year" if p[1] is None else "month")
        en_opts, de_opts = date_mentions(p[0], prec)
        if not mentions(art_en, en_opts):
            errs.append(f"{where}: {label} year {p[0]} not mentioned in article_en")
        if not mentions(art_de, de_opts):
            errs.append(f"{where}: {label} year {p[0]} not mentioned in article_de")


def check_source(src, where: str, errs: list[str]) -> None:
    if not isinstance(src, dict) or set(src) != SOURCE_KEYS:
        errs.append(f"{where}: source must be {{url, title, lang}}")
        return
    if not isinstance(src["url"], str) or not re.match(r"^https://[^\s]+\.[^\s]+/?", src["url"]):
        errs.append(f"{where}: source url {src['url']!r} not https")
    if not isinstance(src["title"], str) or not src["title"].strip():
        errs.append(f"{where}: source title empty")
    if not isinstance(src["lang"], str) or not re.fullmatch(r"[a-z]{2}", src["lang"]):
        errs.append(f"{where}: source lang {src['lang']!r} not a 2-letter code")


def check_card(stem: str) -> list[str]:
    errs: list[str] = []
    card = json.loads((JSON_DIR / f"{stem}.json").read_text())
    base = json.loads((BASE_DIR / f"{stem}.json").read_text())
    report = REPORT_DIR / f"{stem}.md"
    report_text = report.read_text() if report.exists() else ""
    if len(card["sets"]) != 12:
        return [f"{len(card['sets'])} sets"]
    for si, (s, b) in enumerate(zip(card["sets"], base["sets"]), start=1):
        tag = f"s{si:02d}"
        if s.get("enriched") is not True:
            errs.append(f"{tag}: not enriched")
            continue
        for k in ("notes_en", "notes_de", "notes_internal"):
            if not isinstance(s.get(k), str):
                errs.append(f"{tag}: {k} missing")
        if s.get("notes") != b.get("notes"):
            errs.append(f"{tag}: original notes changed (keep `notes` as provenance)")
        if (b.get("notes") or "").strip() and not any(
            (s.get(k) or "").strip() for k in ("notes_en", "notes_de", "notes_internal")
        ):
            errs.append(f"{tag}: note dropped — classify it into notes_en/notes_de/notes_internal")
        art_en, art_de = s["article_en"], s["article_de"]
        if len(s["questions"]) != 5:
            errs.append(f"{tag}: {len(s['questions'])} questions")
            continue
        for qi, (q, bq) in enumerate(zip(s["questions"], b["questions"])):
            where = f"{tag}q{qi}"
            if set(q) != QUESTION_KEYS:
                errs.append(f"{where}: keys {sorted(set(q) ^ QUESTION_KEYS)} wrong")
                continue
            changed = [k for k in ("en", "de", "answer_en", "answer_de", "original") if q[k] != bq[k]]
            if changed and where not in report_text:
                errs.append(f"{where}: {changed} changed but not listed in the report ({report.name})")
            if not found(art_en, q["answer_en"].strip()):
                errs.append(f"{where}: answer_en {q['answer_en']!r} not in article_en")
            if not found(art_de, q["answer_de"].strip()):
                errs.append(f"{where}: answer_de {q['answer_de']!r} not in article_de")
            check_timeline(q["timeline"], where, art_en, art_de, errs)
            check_source(q["source"], where, errs)
    if not report.exists():
        errs.append(f"report {report.name} missing")
    return errs


def main() -> None:
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    all_stems = stems()
    failed = 0
    for stem in resolve(args):
        errs = check_card(stem)
        idx = all_stems.index(stem) + 1
        print(f"{'PASS' if not errs else 'FAIL'} c{idx:03d} {stem}" + (f" ({len(errs)})" if errs else ""))
        for e in errs[:60]:
            print(f"   {e}")
        if len(errs) > 60:
            print(f"   … {len(errs) - 60} more")
        failed += bool(errs)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
