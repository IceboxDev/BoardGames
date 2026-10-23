# Worker instructions — split ONE big bucket into shards for parallel merge workers

A bucket (one domain/sub-category) has too many printed questions for one merge worker. You split
it into **shards** that separate merge workers (`MERGE.md`, shard mode) can work on at the same time
without ever touching the same article. You only plan — you write no article text.
**Do NOT touch git, do NOT use the Agent tool, do NOT edit repo files, never `pkill`/`kill` by pattern.**
Your prompt gives `WORK`, `BUCKET` and a target shard count.

Read `$WORK/candidates/<stem>.md` (stem = BUCKET with `/` → `__`): the bucket's own articles (id,
title, facts/8) and every printed question with the bank facts it may already be and nearby articles.

## Rules for the plan
- Every printed question of the bucket (`{card, category}`) in exactly ONE shard.
- Each of the bucket's own articles in AT MOST one shard. A merge worker may only rewrite (add-facts /
  split) the articles of its shard, so put a question in the shard that owns the article it will most
  likely join. Articles no question needs stay unlisted (untouched).
- Group by TOPIC: questions that would form or join the same article (same person, work, event,
  franchise, place, theme) go into the same shard, so two workers never write two articles on one
  topic. Questions that are clearly aliases of an existing fact (same question, same answer) can go
  anywhere.
- Shards of similar size (roughly the target count; never more than ~35 questions in one).

## Write
`$WORK/plans/<stem>.json`:
```json
{ "bucket": "<BUCKET>",
  "shards": [ { "name": "g1", "topics": "short description", "questions": [{ "card": "tp-021", "category": 3 }, …],
                "articles": ["a0123", …] }, … ] }
```
Then validate: `python3 -I /var/home/mantas/Documents/Projects/Personal/BoardGames/scripts/quiz-ingest/check-plan.py $WORK <BUCKET>`
— must print `PLAN OK`. End with `PLAN: <path> · <n> shards`.
