"""Add reasons for entities a worker's reasons file left out when the only change is
Russian (answerRu, ru, spans.ru, timeline.labelRu) or answer-mark moves (spans.en/de).
Usage: python3 -I fill_reasons.py <reasons.json> <article ids...>   (run from the repo root)"""
import json, subprocess, sys
REPO = "/var/home/mantas/Documents/Projects/Personal/BoardGames"
P = "packages/core/src/quiz/content/articles/"
rf, ids = sys.argv[1], sys.argv[2:]
reasons = json.load(open(rf))
def ents(a):
    out = {a["id"]: a}
    for f in a.get("facts", []) + a.get("retired", []):
        out[f["id"]] = f
        for w in f.get("wordings", []): out[w["id"]] = w
    return out
added = 0
for aid in ids:
    new = json.load(open(f"{REPO}/{P}{aid}.json"))
    try: old = json.loads(subprocess.run(["git", "-C", REPO, "show", f":{P}{aid}.json"], capture_output=True, check=True, text=True).stdout)
    except subprocess.CalledProcessError: old = {}
    o, n = ents(old), ents(new)
    for eid, e in n.items():
        if eid not in o: continue
        oe = o[eid]; keys = {k for k in set(e) | set(oe) if k not in ("facts", "wordings", "retired") and e.get(k) != oe.get(k)}
        have = reasons.get(eid)
        have = [] if have is None else have if isinstance(have, list) else [have]
        if any(not r.get("fields") for r in have): continue
        keys -= {f for r in have for f in r["fields"]}
        if not keys: continue
        ru, marks = set(), set()
        for k in keys:
            if k in ("answerRu", "ru", "titleRu", "bodyRu", "notesRu"): ru.add(k)
            elif k == "timeline":
                a, b = dict(oe.get(k) or {}), dict(e.get(k) or {}); a.pop("labelRu", None); b.pop("labelRu", None)
                if a == b: ru.add(k)
            elif k == "spans":
                a, b = oe.get(k) or {}, e.get(k) or {}
                if a.get("ru") != b.get("ru"): ru.add(k)
                if any(a.get(l) != b.get(l) for l in ("en", "de")): marks.add(k)
        if keys - ru - marks: continue  # a real content change: leave it unexplained
        rs = []
        if ru: rs.append({"kind": "translated", "reason": "Russian added for the Publish or Perish enrichment (answer, wording, timeline label and answer mark as applicable).", "fields": sorted(ru)})
        if marks: rs.append({"kind": "marked", "reason": "Answer marks moved onto the sentence that gives the answer (body rewritten by the merge).", "fields": ["spans"]})
        if ru & marks: rs = [{"kind": "translated", "reason": "Russian answer mark added and the English/German marks moved onto the sentence that gives the answer.", "fields": sorted(ru | marks)}]
        allr = have + rs
        reasons[eid] = allr[0] if len(allr) == 1 else allr; added += 1
json.dump(reasons, open(rf, "w"), ensure_ascii=False, indent=1)
print(f"filled {added} reasons")
