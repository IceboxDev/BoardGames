# Validate a shard plan: every printed question of the bucket exactly once, articles disjoint and own.
import json, re, sys, glob, os
work, bucket = sys.argv[1], sys.argv[2]
stem = bucket.replace("/", "__")
plan = json.load(open(os.path.join(work, "plans", stem + ".json")))
assert plan["bucket"] == bucket, "bucket mismatch"
md = open(os.path.join(work, "candidates", stem + ".md")).read()
own = set(re.findall(r"^- `(a\d+)`", md.split("\n## {")[0], re.M))
want = set()
for f in glob.glob(os.path.join(work, "printed", "*.json")):
    card = json.load(open(f))
    for i, q in enumerate(card["questions"]):
        if f"{q['domain']}/{q['sub']}" == bucket:
            want.add((card["card"], q.get("category", i + 1)))
seen, arts, errs = {}, {}, []
for s in plan["shards"]:
    for q in s["questions"]:
        k = (q["card"], q["category"])
        if k in seen: errs.append(f"{k} in {seen[k]} and {s['name']}")
        seen[k] = s["name"]
    for a in s["articles"]:
        if a not in own: errs.append(f"{a} is not this bucket's article")
        if a in arts: errs.append(f"{a} in {arts[a]} and {s['name']}")
        arts[a] = s["name"]
    if len(s["questions"]) > 40: errs.append(f"{s['name']} has {len(s['questions'])} questions")
missing = want - set(seen); extra = set(seen) - want
if missing: errs.append(f"missing: {sorted(missing)}")
if extra: errs.append(f"not in this bucket: {sorted(extra)}")
print("\n".join(errs) if errs else f"PLAN OK — {len(plan['shards'])} shards, {len(seen)} questions")
sys.exit(1 if errs else 0)
