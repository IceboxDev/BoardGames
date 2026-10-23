#!/usr/bin/env python3
"""Validate one quiz-card JSON file. Prints PASS or a list of failures; exit 1 on failure."""
import json
import re
import sys
import unicodedata

CATS = [
    ("Stage & Music", "Bühne & Musik"),
    ("Language & Literature", "Sprache & Literatur"),
    ("Art & Architecture", "Kunst & Architektur"),
    ("Film & TV", "Film & Fernsehen"),
    ("Sport & Games", "Sport & Spiel"),
    ("History & Society", "Geschichte & Gesellschaft"),
    ("Business & Politics", "Wirtschaft & Politik"),
    ("Religion & Philosophy", "Religion & Philosophie"),
    ("Medicine & Science", "Medizin & Wissenschaft"),
    ("Earth & Space", "Erde & Weltall"),
    ("Flora & Fauna", "Flora & Fauna"),
    ("Computers & Technology", "Computer & Technik"),
]

ARTICLE_MIN, ARTICLE_MAX = 250, 800


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    s = s.replace(" ", " ")
    s = re.sub(r"[‘’‚′]", "'", s)
    s = re.sub(r"[“”„″]", '"', s)
    s = re.sub(r"[‐-―]", "-", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip().casefold()


def words(s: str) -> int:
    return len(re.findall(r"\S+", s))


def check(path: str) -> list[str]:
    errs: list[str] = []
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:  # noqa: BLE001
        return [f"invalid JSON: {e}"]
    if not isinstance(data, dict):
        return ["top level must be an object"]
    if not isinstance(data.get("image"), str) or not data["image"].strip():
        errs.append("missing 'image'")
    sets = data.get("sets")
    if not isinstance(sets, list):
        return errs + ["'sets' must be a list"]
    if len(sets) != 12:
        errs.append(f"expected 12 sets, got {len(sets)}")
    for i, s in enumerate(sets):
        tag = f"set {i + 1}"
        if not isinstance(s, dict):
            errs.append(f"{tag}: not an object")
            continue
        if s.get("n") != i + 1:
            errs.append(f"{tag}: n should be {i + 1}, got {s.get('n')!r}")
        if i < len(CATS):
            en, de = CATS[i]
            if s.get("category_en") != en:
                errs.append(f"{tag}: category_en should be {en!r}, got {s.get('category_en')!r}")
            if s.get("category_de") != de:
                errs.append(f"{tag}: category_de should be {de!r}, got {s.get('category_de')!r}")
        for key in ("article_title_en", "article_en", "article_title_de", "article_de"):
            v = s.get(key)
            if not isinstance(v, str) or not v.strip():
                errs.append(f"{tag}: '{key}' missing/empty")
        if "notes" in s and not isinstance(s["notes"], str):
            errs.append(f"{tag}: 'notes' must be a string")
        qs = s.get("questions")
        if not isinstance(qs, list) or len(qs) != 5:
            errs.append(f"{tag}: expected exactly 5 questions, got {len(qs) if isinstance(qs, list) else type(qs).__name__}")
            qs = qs if isinstance(qs, list) else []
        art_en = norm(s.get("article_en", "") or "")
        art_de = norm(s.get("article_de", "") or "")
        seen_en: set[str] = set()
        seen_de: set[str] = set()
        for j, q in enumerate(qs):
            qt = f"{tag} q{j + 1}"
            if not isinstance(q, dict):
                errs.append(f"{qt}: not an object")
                continue
            want_orig = j == 0
            if q.get("original") is not want_orig:
                errs.append(f"{qt}: 'original' must be {want_orig}")
            for key in ("de", "en", "answer_de", "answer_en"):
                v = q.get(key)
                if not isinstance(v, str) or not v.strip():
                    errs.append(f"{qt}: '{key}' missing/empty")
            a_en = norm(q.get("answer_en", "") or "")
            a_de = norm(q.get("answer_de", "") or "")
            if a_en and a_en not in art_en:
                errs.append(f"{qt}: answer_en {q.get('answer_en')!r} not found verbatim in article_en")
            if a_de and a_de not in art_de:
                errs.append(f"{qt}: answer_de {q.get('answer_de')!r} not found verbatim in article_de")
            if a_en in seen_en:
                errs.append(f"{qt}: duplicate answer_en {q.get('answer_en')!r} within set")
            if a_de in seen_de:
                errs.append(f"{qt}: duplicate answer_de {q.get('answer_de')!r} within set")
            seen_en.add(a_en)
            seen_de.add(a_de)
            for key in ("de", "en"):
                v = q.get(key) or ""
                tail = v.strip().rstrip("\"'“”„‘’«»)")
                if isinstance(v, str) and v.strip() and not tail.endswith(("?", ".", "!")):
                    errs.append(f"{qt}: '{key}' does not end with '?', '.' or '!' (closing quotes are fine)")
        for key in ("article_en", "article_de"):
            v = s.get(key)
            if isinstance(v, str):
                n = words(v)
                if n < ARTICLE_MIN or n > ARTICLE_MAX:
                    errs.append(f"{tag}: {key} has {n} words (want {ARTICLE_MIN}-{ARTICLE_MAX})")
    return errs


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: check_card.py <file.json> [...]", file=sys.stderr)
        sys.exit(2)
    bad = 0
    for path in sys.argv[1:]:
        errs = check(path)
        if errs:
            bad += 1
            print(f"FAIL {path}")
            for e in errs:
                print(f"  - {e}")
        else:
            print(f"PASS {path}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
