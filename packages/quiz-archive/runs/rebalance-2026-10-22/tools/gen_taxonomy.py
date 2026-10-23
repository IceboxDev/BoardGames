"""Rewrite QUIZ_DOMAINS in taxonomy.ts from a JSON list [{slug,en,de,ru,subs:[{slug,en,de,ru}]}]."""
import json, re, sys
TAX = "/var/home/mantas/Documents/Projects/Personal/BoardGames/packages/core/src/quiz/taxonomy.ts"
spec = json.load(open(sys.argv[1]))
q = lambda s: json.dumps(s, ensure_ascii=False)
out = ["export const QUIZ_DOMAINS: readonly QuizDomain[] = ["]
for n, d in enumerate(spec, 1):
    out += ["  {", f"    n: {n},", f"    slug: {q(d['slug'])},", f"    en: {q(d['en'])},",
            f"    de: {q(d['de'])},", f"    ru: {q(d['ru'])},", "    subs: ["]
    for s in d["subs"]:
        out.append(f"      sub({q(s['slug'])}, {q(s['en'])}, {q(s['de'])}, {q(s['ru'])}),")
    out += ["    ],", "  },"]
out.append("];")
t = open(TAX).read()
t = re.sub(r"export const QUIZ_DOMAINS: readonly QuizDomain\[\] = \[.*?\n\];", "\n".join(out), t, flags=re.S)
open(TAX, "w").write(t)
