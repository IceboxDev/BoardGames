# Worker instructions — finer sub-categories + misfile review

The quiz bank (`/var/home/mantas/Documents/Projects/Personal/BoardGames/packages/core/src/quiz/`)
was just regrouped into 19 domains (`taxonomy.ts` — read it first). Every article
(`content/articles/aNNNN.json`) has a `domain` and a `sub`; `content/index.json` lists every
article's id, domain, sub and titles. Your prompt names YOUR domains.

**Do NOT edit any repo file, do NOT touch git, do NOT use the Agent tool.** You only write your
result file `/var/home/mantas/Downloads/quiz-cards/rebalance/<N>.json` (N = your unit number).
Scratch scripts: `/var/home/mantas/Downloads/quiz-cards/rebalance/scratch-<N>/`.

## Your job

1. Read every article of your domains: title, the first paragraph of `bodyEn`, and each active
   fact's first wording `en` (enough to know what the article is about).
2. **Make big sub-categories more specific.** Any sub with more than ~60 articles is split into
   2–4 finer subs by a meaningful, player-recognisable distinction (era, region, genre, kind —
   not alphabet). Target sizes 15–60. The part that keeps the old meaning keeps the old slug;
   new subs get new slugs (lowercase, hyphens, ≤ 20 chars, unique across the WHOLE taxonomy —
   check `taxonomy.ts`), with labels in English, German and Russian in the house style
   ("Hollywood & Blockbusters" / "Hollywood & Blockbuster" / "Голливуд и блокбастеры"). A
   domain ends with 3–8 subs. Small subs (< 15) may be merged into a neighbour only if the
   label still fits; never delete a slug that is not merged.
3. **Misfiled articles.** If an article clearly belongs to ANOTHER domain (its topic, not one
   stray fact), list it under `outgoing` with the target domain and a suggested existing sub of
   that domain. Be conservative — borderline stays.
4. Every article of your domains appears exactly once: in `assign` (its sub in your domain,
   even when unchanged) or in `outgoing`.

## Result file

```json
{
  "subs": {
    "<domain>": [ {"slug": "film", "en": "…", "de": "…", "ru": "…"}, … ]   // the domain's FULL final sub list, in display order
  },
  "assign": { "a0123": {"sub": "film", "reason": "…"}, … },               // reason only needed when the sub changes
  "outgoing": { "a0456": {"domain": "history", "suggestedSub": "modern-history", "reason": "…"} }
}
```

Reasons are for a reader who wasn't there: "A film-music article (Ennio Morricone's scores) —
moved from Film to the new Film Music sub." Check with a quick script that every article of
your domains is covered exactly once and report the final count per sub.

End your final message with: `RESULT: <path> · <n> subs · <n> reassigned · <n> outgoing`.
