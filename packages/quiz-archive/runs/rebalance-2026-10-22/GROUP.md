# Worker brief: group the quiz bank into 14 categories of 199–200 articles

The quiz bank (`/var/home/mantas/Documents/Projects/Personal/BoardGames/packages/core/src/quiz/content/articles/aNNNN.json`) has **2,793 articles**. They are being regrouped into **exactly 14 categories (domains)**: 7 of 200 articles and 7 of 199. The owner's words: *"group 200 articles logically and then name the category by a name that fits them best, not force things under an incorrect name."* So the category's NAME follows its contents, never the reverse. The old names don't bind you.

The 14 domain slugs are fixed internal ids (members' settings store them). Use only these:
`music-stage, film-media, literature, history, society, science, nature, earth-space, geography, belief, art, sport-games, technology, everyday`.
A slug is just an id: `everyday` can hold pop culture, `geography` can hold languages, as long as the NAME you give it says so honestly.

**Do NOT edit any repo file, do NOT touch git, do NOT use the Agent tool.** Write only your result file `/var/home/mantas/Downloads/quiz-cards/rebalance/<rN>.json`. Put scratch scripts in `/var/home/mantas/Downloads/quiz-cards/rebalance/scratch-<rN>/`.

## Your input

`/var/home/mantas/Downloads/quiz-cards/rebalance/pools/<rN>.tsv` lists every article you own: id, its original domain/sub (as players know it today), a finer topic tag (`fineSub`, from an earlier pass; useful, not binding) and its English title. Your prompt gives your targets.

For every article, read at least the title, the first paragraph of `bodyEn` and the English question of each active fact (`facts[].wordings[0].en`, skipping `retired`). That is enough to know what it is about. Decide by topic, article by article.

## Your job

1. Place every article of your pool exactly once in one of your allowed domains, hitting your target counts EXACTLY. Exports to other agents' domains have exact counts too: choose for export the articles that fit the receiving domain best, never filler.
2. For each domain you own (not the export targets): give it 3–8 sub-categories of 15–60 articles each where possible. Use a meaningful, player-recognisable distinction (era, region, genre, kind), not the alphabet. Reuse an existing `fineSub` slug when the sub keeps that meaning. Otherwise create a new slug: lowercase-hyphen, ≤ 20 chars, starting with your agent id (e.g. `r3-cold-war` is NOT needed if `cold-war` fits; `r3-...` only for NEW slugs, to stay unique bank-wide). Labels in English, German and Russian in the house style ("Hollywood & Blockbusters" / "Hollywood & Blockbuster" / "Голливуд и блокбастеры").
3. Name each domain you own from what it now holds: a short label (1–4 words, use "&" to join, e.g. "Music & Stage") in en/de/ru. It must describe ALL its contents honestly.
4. For exported articles, give a `suggestedSub`: a short English description of the topic group they'd form in the receiving domain (e.g. "TV entertainment & game shows"). The coordinator builds those subs.
5. Reasons: one sentence each for a reader who wasn't there, e.g. "A sitcom history (Friends) — moved from Film & Media to the new Everyday Life & Pop Culture category, beside the other TV entertainment." A reason is required whenever the domain differs from `originalDomain`. When only the sub changes, a short reason is enough.

## Result file

```json
{
  "domains": {
    "music-stage": {"en": "…", "de": "…", "ru": "…",
                    "subs": [{"slug": "classical", "en": "…", "de": "…", "ru": "…"}, …]}
  },
  "place": {
    "a0001": {"domain": "music-stage", "sub": "classical", "reason": "…"},
    "a0456": {"domain": "everyday", "suggestedSub": "TV entertainment & game shows", "reason": "…"}
  }
}
```

Before finishing, run a quick script to check: every pool article appears exactly once; the counts per domain equal your targets exactly; every owned sub is used; and no unused or unknown sub appears. Report the count per domain and per sub.

End your final message with: `RESULT: <path> · <counts per domain>`.
