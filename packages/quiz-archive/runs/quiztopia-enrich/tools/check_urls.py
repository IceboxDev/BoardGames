#!/usr/bin/env python3
"""Check that every source URL of the given cards resolves.

Usage: check_urls.py c001 c002 … | IMG… | --all   (same card syntax as enrich_check.py)

Wikipedia links are checked through the REST summary API: the page must
exist and must not be a disambiguation page. Other links get a GET
(following redirects); < 400 passes. Sites that block scripted requests
(401/403/429) are reported as WARN, not FAIL — confirm those by hand with
WebFetch. Results are cached in tools/url_cache.json (only successes).
Exit code 1 when any URL fails.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from enrich_check import JSON_DIR, resolve, stems  # noqa: E402

CACHE = Path(__file__).resolve().parent / "url_cache.json"
UA = "QuiztopiaContentCheck/1.0 (local content QA; mantas board games)"
lock = threading.Lock()


def load_cache() -> dict:
    try:
        return json.loads(CACHE.read_text())
    except Exception:
        return {}


def ascii_url(url: str) -> str:
    """Percent-encode non-ASCII characters (IRIs like /wiki/Kärnten); keeps existing escapes."""
    return urllib.parse.quote(url, safe=":/?#[]@!$&'()*+,;=%~-._")


def fetch(url: str, timeout: int = 20):
    req = urllib.request.Request(ascii_url(url), headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read(200_000)


def check(url: str) -> tuple[str, str]:
    parsed = urllib.parse.urlparse(url)
    host = parsed.netloc
    try:
        if host.endswith(".wikipedia.org") and parsed.path.startswith("/wiki/"):
            title = parsed.path[len("/wiki/"):]
            api = f"https://{host}/api/rest_v1/page/summary/{title}"
            status, body = fetch(api)
            data = json.loads(body)
            if data.get("type") == "disambiguation":
                return "FAIL", "disambiguation page"
            if data.get("type") not in ("standard",):
                return "FAIL", f"type {data.get('type')}"
            return "OK", data.get("title", "")
        status, _ = fetch(url)
        return ("OK", str(status)) if status < 400 else ("FAIL", str(status))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 429, 999):
            return "WARN", f"HTTP {e.code} (bot-blocked? confirm with WebFetch)"
        return "FAIL", f"HTTP {e.code}"
    except Exception as e:  # noqa: BLE001
        return "FAIL", f"{type(e).__name__}: {e}"


def main() -> None:
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    all_stems = stems()
    cache = load_cache()
    urls: dict[str, list[str]] = {}
    for stem in resolve(args):
        card = json.loads((JSON_DIR / f"{stem}.json").read_text())
        idx = all_stems.index(stem) + 1
        for si, s in enumerate(card["sets"], start=1):
            for qi, q in enumerate(s["questions"]):
                src = q.get("source")
                if isinstance(src, dict) and isinstance(src.get("url"), str):
                    urls.setdefault(src["url"], []).append(f"c{idx:03d}s{si:02d}q{qi}")
    todo = [u for u in urls if cache.get(u) != "OK"]
    results = {u: ("OK", "cached") for u in urls if u not in todo}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for u, res in zip(todo, pool.map(check, todo)):
            results[u] = res
    with lock:
        # 24 agents share this file: merge with the latest copy, write atomically.
        fresh = load_cache()
        for u, (state, _) in results.items():
            if state == "OK":
                fresh[u] = "OK"
        tmp = CACHE.with_name(f"url_cache.{os.getpid()}.tmp")
        tmp.write_text(json.dumps(fresh, indent=0, sort_keys=True))
        os.replace(tmp, CACHE)
    fails = warns = 0
    for u, (state, why) in sorted(results.items(), key=lambda kv: kv[1][0]):
        if state != "OK":
            print(f"{state} {u} — {why} — used by {', '.join(urls[u][:6])}")
            fails += state == "FAIL"
            warns += state == "WARN"
    print(f"{len(urls)} urls: {len(urls) - fails - warns} ok, {warns} warn, {fails} fail")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
