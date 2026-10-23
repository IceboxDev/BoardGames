# Trivial Pursuit ingest run (started 2026-10-20)
Plan: ~/.claude/plans/snoopy-wiggling-sky.md
- numbers.tsv: photo → card number (399 unique, 1–400, **221 missing**)
- queue.txt: 200 jobs × 2 cards; queue_next.txt = next job index (0-based count of launched)
- PROMPT.md: worker prompt template (CARDS placeholder); worker recipe scripts/quiz-ingest/TRANSCRIBE.md
- Stage 2 pilots: jobs 1–3 launched (tp-001..006)
- queue4.txt: remaining 326 cards as 4-card jobs (82); queue4_next.txt; next4.sh

## Known card issues to fix in enrich (kept as printed by transcribers)
- tp-326 Q5: Edison/Topsy is a myth — answer "Thomas Edison" kept; rework to the real fact.
- tp-335: Amadeus Tony year 1981 not 1980 — question text still says 1980.

## OWNER (2026-10-20): PAUSE after all cards are transcribed — do NOT start Stage 3 (merge) until the owner says so.
- tp-370 Q1: first illuminated ad in Berlin was 1896 (end of 19th c.), card says early 20th — wording kept.

## 2026-10-20/21: Stage 2 DONE — 399/399 printed cards valid (2394 questions, 927 reworked). Missing photo: card 221.
## Stage 0 (web/server RU + images, migration 0062 on staging) DONE.
## PAUSED by owner before Stage 3. Next: `pnpm quiz-ingest candidates ~/Downloads/quiz-cards/trivial-pursuit`, then one MERGE.md agent per bucket.

## Stage 3 (started 2026-10-21): queue stage3_queue.txt (23 big buckets → PLAN.md planner → shard writers; 37 small → MERGE.md). Launched lines tracked in stage3_launched.txt. Shard decisions: decisions/<stem>.<shard>.json; validate with `apply WORK BUCKET --part=<stem>.<shard>`.
- Stage3 review: olympics.g1 made a new 'Mike Tyson' article while f03562 (Tyson) exists elsewhere — check for topic overlap.
- Stage3 review: tv.g1 aliased tp-298 (series title Xena) to f05117 (character name) — check.
- Enrich: a1480 vs a1984 disagree on when Peter Lustig left Löwenzahn (2006 vs 2005).
- Stage3 review: cities.g4 aliased tp-354 (Hermitage cats) to f02293 (museum) — check.
- Stage3 review: cities.g2 Hamburg article has two facts whose answer is 'Hamburg' (tp-134, tp-348) — trivially easy inside a Hamburg article.
- Stage3 review: loose aliases physical.g2 tp-399 (Mekong vs Mississippi) and tp-177 (Dead Sea resort) — article must support the alternative wording.
- Stage3 DUPLICATE TOPIC: 'Niagara daredevils' new article in both sport-games/motor-winter g2 and history/contemporary g2 — merge after apply.
- Enrich: spans after merge = first occurrence (e.g. a0566 two '100' facts, a0034 '0') — enrich span step must fix; check repeated-answer articles.
- Stage3 OVERLAP: pop-rock.g2 'Music in space' (Space Oddity) vs astronomy.g2 'Life aboard the station' (Space Oddity/Hadfield generated fact) — dedupe.
- Stage3 review: plants.g1 aliased tp-041/303/345 (different plants, same family answer) — should be new facts; re-decide in round 2 or post-apply fix.
- Stage3 OVERLAP: 'Adolf Grimme' generated fact in tv.g3 (TV awards) and media.g1 (journalism prizes) — dedupe.
- Enrich: transport.g2 number plates single-letter answers 'H' and 'E' — span on first letter; rewrite answer as quoted „H“ etc.
- Stage3 DUPLICATE TOPIC: zeppelins — modern-history.g3 'Zeppelins (Lakehurst)' vs transport.g1 'Airships' (Hindenburg, Eckener) — merge after apply.
- Enrich: a0815 anteater '30,000' vs new sloth/anteater article 'up to 35,000' — reconcile. Mammals: Goodall and purring articles each have 2 facts with same answer.
- Stage3 DUPLICATE TOPIC: 'odd world championships' in sport-games/games AND everyday/leisure (both generated wife carrying + bog snorkelling) — merge after apply.
- Verify: Valentino Garavani death 19 Jan 2026 (from Wikipedia, art/design). OVERLAP: International Klein Blue in art/design (colours) and painting.g2 (a1179).
- Stage3 OVERLAP: business 'Firsts of German advertising' generated Litfaß + Mainzelmännchen (both have own articles: a0810, tv.g4 Mainzelmännchen).
- Stage3 OVERLAP: classics 'Lost Generation: Fitzgerald & Hemingway' vs modern-lit.g4 'American First Novels' + 'Hemingway's Cuba'.
- Stage3 OVERLAP: Double Gloucester cheese-rolling generated in holidays ('Festivals as spectacle') and leisure ('Odd championships').
- Stage3 CHECK: poetry generated 'Nerval's lobster' — tp-159 printed Nerval question may exist elsewhere (duplicate fact).

## OWNER (2026-10-21): PAUSE again after the current round-1 agents (inventions, football g2) finish — do NOT start round 2 until told.
- Round 1: tp-152/1 (Tasmania) was missed by all shards; added as handoff in countries.g3.

## 2026-10-21: Stage 3 round 1 DONE — 100 decision files; 309 aliases, 1926 printed questions as facts, 1869 generated facts, 537 new articles, ~500 rewrites; 159 handoffs (80 = repeated answers moved out by coordinator, 1 = missed Tasmania). All round-1 decisions apply together (only "no card slot" warnings, a partial-mode artifact). Backup of pre-repeat-fix decisions: scratch/coord/decisions-backup/.
## Round 2 tooling ready (not run): `apply WORK --stage=WORK/staged` → `candidates WORK --handoff --bank=WORK/staged` → one MERGE.md ROUND 2 agent per r2__ bucket → decisions/zz-r2-<stem>.json → full `apply WORK --dry-run` then `apply WORK`.
## PAUSED by owner before round 2.
- R2 CHECK after round 2: handoff notes for repeat-type carry STALE fact ids (computed before decisions were trimmed). Verify every r2 alias target's answer matches the printed answer.
- OVERLAP: r2 cities 'Copies of Europe Around the World' vs cities.g4 'China's copycat towns'.
- OVERLAP: dog tax in r2 law 'Dogs and German Law' (Offenbach 1807) and politics 'German taxes' (dog tax).

## 2026-10-21: Stage 3 DONE — bank applied (vc141199a64a9): 2696 articles, 14703 facts; 143 decisions (100 round 1 + 43 round 2), 317 aliases, 572 new articles, 579 rewrites, 2 generated facts dropped (f08183 Spinning, f14108 Chamonix). All suites/typecheck green; 21 new timeline block names added. Pre-apply bank backup: scratch/coord/content-before-apply/.
## Next: dedupe pass over the OVERLAP/DUPLICATE items above, then Stage 4 (ENRICH.md).

## Stage 4 (started 2026-10-21): 233 batches in enrich_queue.txt ("<n> <fstart> <wstart> ids…", reserved id ranges for top-ups); launched lines in enrich_launched.txt; pop with ./nextenrich.sh; prompt = "Read …/ENRICH.md and follow it exactly. Your articles: … Your id ranges…: facts from fX, wordings from wX (max 20 each)." Notes per article: enrich-notes.md. Reports: ~/Downloads/quiz-cards/enrich-report/. Pilot 116 PASS (good quality). Dedupe done before (dedupe-report.md; migration 0063 carries progress, applied to staging).

## OWNER (2026-10-21): PAUSE Stage 4 — no new enrich workers; let the running batches (001–020) finish, then stop.
- 2026-10-20: usage limit hit. Enrich DONE+PASS: pilots 000,116, batches 004,010. Still running at cutoff: 001-003,005-009,011-020 — on resume check enrich-report/ for which finished; rerun any batch without a report (its articles may be half-done; check-bank --complete <ids>).
## OWNER (2026-10-21, later): RESUME Stage 4 — continue all agents and spawn new ones.
- Post-Stage-4 TODO: many images are 330px/500px Wikimedia thumbs (full-size originals were 429-rate-limited). Run a script to upgrade thumb URLs to ~1280px (verify 200 + image/*) when rate limits relax.
- Verify (final review): Sagrada Família central tower completed Feb 2026 at 172.5 m, blessed by Leo XIV 10 Jun 2026 (a1719, a1671); Leo XIV back in papal apartments Mar 2026 (a0711).
- Final review: a0646 f03229 wording asks Lindbergh 1927 but timeline/source are Alcock & Brown 1919 — fix.
- Verify (final review): Artemis II flew Apr 2026, Artemis III = 2027 Earth-orbit test, IV = 2028 landing (a1942); BepiColombo orbit Nov 2026 (a1990).
- Final review: a2186 f11093/f11094 near-identical answers (fries) — make distinct or alias.

## OWNER (2026-10-21): PAUSE Stage 4 again — spawn no new enrich workers; let the running ones finish. Last launched: batch 054.
- Final review: near-duplicate facts a0599 f02993 and a1235 f06173 (horseradish with Tafelspitz) — dedupe.

## 2026-10-20 — PAUSED (Stage 4)
- Enrich batches 000–054 + 116 done (56/233; 641 articles). Running: none.  (2026-10-21: owner said continue; launching 20 at a time again.) Next to launch: batch 055 (`nextenrich.sh`).
- After last wave: `rebuild` → 2693 articles, 13954 facts; full `check-bank` 0 problems (non-complete mode).
- Thumbnail-upgrade list grows: 330px fallbacks in batches 021 (a0512), 022 (6 imgs), 024 (6 imgs), others per reports.
- Review: RU spans on inflected stems (Sisyphus/Oedipus in 022, Cicero in a1532).
- Batch 026 (a0008–a0212): 12 of 21 image URLs verified only via Commons API (curl 429) — re-curl them in the final image pass.
- a1984 vs a1480: Lustig end 2005 — RESOLVED (both say 2005).
- Post-cutoff claims to spot-check: Maru the cat died 2025-09-06 (a2258?), Downton 3rd film 2025, Batic/Leitmayr Tatort ended Easter 2026, Scrubs revival 2026-02-25, HCMC 2025 merger.
- a2316: India–Sri Lanka narrowest gap changed 55 km → ~24 km (Dhanushkodi–Talaimannar); common figures ~29–30 km by sea / Palk Strait 53 km — verify.
- Museums by state: a1222 now says BW and Bavaria vie (2021: BW 1,237 vs BY 1,198); a2676 uses de.wiki totals — check the two agree on which state leads.
- Post-cutoff (batch 090): US penny circulation minting ended Nov 2025 (a2349); US Paris exit effective 2026-01-27 (a2353).
- Monaco UNESCO tentative list: batch 076 removed the claim (unconfirmed), batch 077 (a2674–a2676?) kept it as low-confidence — reconcile.
- a1662 f12094: printed card asks which CONTINENT is the 'cradle of civilisation' but merged answer is 'Mesopotamia' — likely wrong alias; check card text and split if needed.
- Final pass: bank-wide scan for spans in table rows/headings or inside longer words (batch 079 found 15 such marks the check accepts; ENRICH.md now tells workers from batch 109 on).
- Batch 081: a1030 mentions a 2026 closure of the Strait of Hormuz (post-cutoff, verify); a0910 Elbe border stretch 'almost 100 km Schnackenburg–Lauenburg' written from memory — verify.
- a0258 f01286: printed card's answer 'Boston Tea Party' for what began the War of Independence is wrong (Lexington/Concord) — rework the wording (keep cardText) rather than just a note.
- a2397: Sharpeville massacre photo shows dead/wounded — owner may want it swapped (image review).
- Prague 1618 defenestration fall: a0258 says ~20 m, a1086 ~21 m (others 16–17 m) — harmonise.
- Possible cross-article duplicate answers: 'magenta' (a1562 + a1706), check in final duplicate scan.

## 2026-10-21 — PAUSE Stage 4 (owner): spawn no new enrich workers; let running ones finish. Last launched: batch 139.
- a2440? f12831: printed card asked about a writer hosting a yearly seminar in a remote village; merged as birthplace question (Pålmark) — possible wrong alias, check card text.
- Possible cross-article duplicate: theremin/Léon Theremin (a1201 new f22541 vs a0037). Duplicate scan.
- Duplicate answer across articles: '(I've Had) The Time of My Life' in a1165 and 'The Time of My Life' in a1708 — dedupe; also a1165 kept bracketed answers (inconsistent with a1708 which moved brackets to notes).
- a1657 w08281: printed card says the 'Joy Division' served the Wehrmacht (novel: concentration-camp brothel for German soldiers) — rework premise (keep cardText).
- 2026-10-21 PAUSED: batches 000–139 done (140/233, 1619 articles). Running: none. Next: 140 via nextenrich.sh. rebuild → 2693 articles / 14042 facts; check-bank 0 problems.
- 2026-10-21 owner: fill to 20 ONCE, no refills — launched batches 140–159; pause after them.
- a0815 vs a2512: anteater — RESOLVED (both ~35,000).
- Duplicate scan: new a1825 facts 'Scheibenwischer', 'Neues aus der Anstalt', 'Lothar Dombrowski' — check vs a0889 / a1237.
- a1703: Russian answers in instrumental ('кожей', 'жабрами') — decide if OK or rephrase question for nominative.
- 2026-10-21 19:40 USAGE LIMIT hit. Done from wave 140–159: 140,141,144,145,146,147,151,155,156,159. Still running (may be cut off → resume via SendMessage or relaunch reusing scratch dir): 142,143,148,149,150,152,153,154,157,158. After all done: rebuild + check-bank, then pause (no refills).
- 2026-10-21 21:22 owner: resume broken agents (142,143,148,149,150,152,153,157,158 via SendMessage) and refill to 20 continuously again. 154 done.
- Duplicate scan: kiwifruit renaming (1959) appears in a0875, a1895, a1907 — check for duplicate answers.
- a0849: printed card says toxoplasmosis 'primarily affects cats' — misleading premise, consider rework (keep cardText).
- a2025 w10121: printed German question says tangent 'schneidet' the circle (wrong — touches) — rework question (keep cardText).
- Duplicate scan: 'Puy de Dôme' (new a1497 f23341) vs a0045 Pascal/Périer; 'Søren Sørensen'/pH (new a0069 f23321) vs any pH article.
- Final pass: scan bank for remaining choice questions of form '…, X or Y?' / '…X oder Y?' — batch 174 found 5 in a0813 that the checker heuristic missed.
- a2540/a0355: printed premises left outdated (Harvard as Ig Nobel organiser; 'since 2006 The Body Shop' belongs to L'Oréal) — rework wording (keep cardText).
- Post-cutoff: a1689 gives James Watson's dates as 1928–2025 — verify.
- a0511: 1941 balboa banknotes written from memory — verify.
- tp-376 (a2693): card asked which ambassador alone has an official embassy bike; merge aliased it to 2025 #BotschaftenOnBike winner — possible wrong alias. Also a2691 Guinea worm 10 cases in 2025 (post-cutoff).
- Post-cutoff: a1440 TikTok US joint venture since 2026-01-22 — verify.
- Post-cutoff HIGH PRIORITY verify: a0847 Khamenei killed 2026-02-28, Mojtaba Supreme Leader; a0703 Maduro captured 2026-01-03; a0634 Timor-Leste ASEAN 11th member Oct 2025, OPEC 12 members.
- Post-cutoff HIGH PRIORITY verify: a0139 Vučić resigned 2026-09-27 (wording w00694 changed to past tense).
- Post-cutoff: a0031 Kretschmann governed until May 2026, succeeded by Cem Özdemir — verify.
- Post-cutoff: a1567 Versace sold to Prada 2025; a1771 BRICS incl. Indonesia 2025.
- Post-cutoff: a0221 2026 Stanley Cup (Hurricanes), NBA (Knicks), World Series Rays vs Brewers; a2578 Magdeburg 2026 handball title — verify (and the article doesn't claim a WS winner yet).
- Post-cutoff: a2095 Najib convicted in main 1MDB trial Dec 2025; Netanyahu 'PM since Dec 2022' may be outdated after late-2026 Israeli election.
- Consistency: Lafontaine 1990 attack details in a0895 (batch 097) vs a1819 (batch 190: two bouquets + book, no knife in flowers) — make sure both agree.
- Post-cutoff: a2580 2026 World Cup now past tense (48 teams) — verify any winner/result claims.
- Post-cutoff: a2605 DEL 2026-09-14 Lüdemann 1,200 games correction; Eisbären Berlin 12th title — verify.
- Duplicate scan: new a1493 'Jigorō Kanō'/'Ippon' vs a0317 judo; a1445 'Telemark'/'Arnold Lunn' vs other skiing articles.
- Duplicate scan: new a1985 'Horst Schlämmer'/'Herbert Knebel' vs a1237 (comedian characters); a1553 'Morihei Ueshiba'/'yokozuna' vs martial-arts/sumo articles.
- 2026-10-21 22:18 queue EMPTY: all 233 batches launched (last 231, 232). After all finish: rebuild + full check-bank, then final pass (STATE review list).
- Duplicate scan: new a1320 'Lou Montulli' vs a1308/a1404 (cookies); a1308 'Harvard Mark II' (bug) vs other computing articles.
- w13932 (a2621?): card asked only what NATO's 'N' stands for; question reworked to ask full expansion — consider splitting into its own fact (answer 'North') instead.
- DUPLICATE answer: 'Ajay Bhatt' added twice (a0180 f24301 by batch 215, a1860 by batch 221); also 'Andy Capp's Tavern'/'Nishikado' and 'Intel 4004' vs other computing articles — dedupe.
- Consistency: Walkman sales — a1735 'around 400 million by 2010' (all formats) vs a1872 'about 220 million cassette units' — harmonise wording.
- 2026-10-21 22:39 STAGE 4 DONE: all 233 batches enriched. rebuild → 2693 articles / 14205 facts; check-bank --complete 0 problems. Next: final pass per review list, then Stage 5.

## 2026-10-21 Owner model change: one question per fact, retire never delete, enforced changelog
- DONE: history.ts + history-io.ts + CLI log/retire/restore/history/errata; content/history backfilled (94.5k entries) from Quiztopia import, TP transcriptions, merge decisions (replayed post-merge bank in scratch/coord/content-after-merge), dedupe, 233 enrich reports; 854 deleted facts restored as retired; USB duplicate merged; 40 wordings split, 28 retired restored (one-question/); 0063 revised (816 pairs); wiki history UI + endpoint; content.test enforces history + complete.
- PENDING: staging schema_migrations checksum for v63 must be updated (old 0063 applied) before local dev boots; browser check of wiki history; final-pass review list above.
