# Post-merge dedupe of the quiz bank: report

Bank before: 2696 articles, 14703 facts. Bank after: **2693 articles, 13851 facts**. `quiz-ingest rebuild` and `check-bank` both pass with 0 problems, and `content.test.ts` passes.
No ids were changed or reused, and no fact with a printed wording was deleted. Every body edit was followed by recomputing the spans with Python. Scripts are in `scratch/dedupe/`.

## 1. Niagara daredevils
- Merged **a2348** (history/contemporary) into **a2607** (sport-games/motor-winter). **a2348 deleted.**
- Moved f12228 (printed tp-277, "in a barrel"), f12230 (Blondin) and f12231 (Wallenda) into a2607.
- Deleted the generated duplicates f12229 (Annie Edson Taylor, a duplicate of printed f14051), f14052 (Blondin) and f14053 (Wallenda). In each case the lower id was kept.
- Added the 1995 Trotter/Martin paragraph and a table row to the EN and DE bodies of a2607. It now has 6 facts.

## 2. Zeppelins / airships
- Merged **a2395** (modern-history) into **a2645** (technology/transport). **a2395 deleted.**
- Moved f12513 (printed tp-378, Lakehurst) and f12515 (Friedrichshafen). f12515 also took over wording w14629 from the deleted f14324.
- Deleted these generated duplicates:
  - f12516 Graf Zeppelin (duplicate of printed f14320)
  - f12517 hydrogen (duplicate of printed f14319)
  - f14324 Friedrichshafen (duplicate of the lower id f12515)
  - f14321 Hindenburg (duplicate of printed f01976 in a0396)
  - f12514 Ferdinand von Zeppelin (duplicate of printed f06780 in a1356)
- The body now covers LZ 1 on 2 July 1900, the count, the First World War raids and Lakehurst. 6 facts.

## 3. Odd world championships / cheese rolling
- Merged **a2207** (everyday/leisure) into **a2596** (sport-games/games), which was retitled "Cherry Stones, Handbags and Wives". **a2207 deleted.**
- Moved f11224 (printed tp-135, cherry-stone record), f11226 (Finland, wife carrying) and f11227 (Wales, bog snorkelling).
- Deleted f13974 (wife carrying) and f13976 (bog snorkelling), which duplicated the lower ids f11226 and f11227.
- Deleted f11225 (Double Gloucester). Cheese rolling stays once, as f11184 in a2200 "Festivals as spectacle".
- Added the Düren paragraph and the August Bank Holiday detail to the body. 6 facts.

## 4. Space Oddity / Chris Hadfield
- Deleted the generated f13117 (a2482 "Music in space"). The fact stays once, as f10906 in a2158 "Life aboard the station". The a2482 body is unchanged and still tells the story.

## 5. Adolf Grimme
- Deleted the generated f11730 (a2278, TV awards). It is kept as f11567 in a2256 (journalism prizes), the lower id.

## 6. International Klein Blue
- Deleted the generated f10652 (a2125, design/colours). Printed f10739 in a1179 is kept.

## 7. Firsts of German advertising (a2541)
- Deleted the generated f13590 (Ernst Litfaß, a duplicate of printed f04046 in a0810).
- Deleted the generated f13591 (Mainzelmännchen, which is covered by a2283).
- a2541 keeps 4 facts.

## 8. Fitzgerald / Hemingway
- Deleted f12895 (Jake Barnes) and f12896 (Gertrude Stein, the "lost generation" epigraph) from a2449 "American First Novels". They duplicated f12697 and f12698 in a2421 "The Lost Generation".
- The articles are now distinct: a2421 covers Americans in Europe, a2449 covers debut novels (5 facts).
- a2450 "Hemingway's Cuba" had no duplicated facts. Its printed f12899 (Hemingway's statue) and a2449's printed f12892 (Pamplona debut) ask different things, so both stay.

## 9. Nerval's lobster
- Deleted the generated f12971 (a2462). Printed f12690 (tp-159, a2420) is kept.

## 10. Copies of Europe / China's copycat towns
- No change was needed. Each fact already existed once: Thames Town f11879 and Tianducheng f11880 in a2299, and the Hallstatt replica (printed f14512) in a2673. The articles are already distinct (China's new cities vs. worldwide replicas).

## 11. Dog tax
- Deleted the generated f14638 (Offenbach am Main, the first dog tax of 1807, in a2688 "Dogs and German Law"). It is kept as f13719 in a2562 "German taxes", the lower id.

## 12. Mike Tyson
- Checked and no duplicated facts were found. a2608 "Iron Mike" has no fact whose answer is Mike Tyson; its facts are Holyfield, the tattoo side, D'Amato, Berbick, Douglas and Lewis. f03562 (youngest heavyweight champion, a0713) and f03384 ("Iron Mike" nickname, a0677) ask different things. Nothing was removed.

## 13. Wrong-alias checks
| Card | Fact | Verdict | Action |
|---|---|---|---|
| tp-298 | Xena, f05117 | same fact | left |
| tp-354 | Hermitage, f02293 | same fact (it identifies the museum) | left; added the cats sentence to the a0459 EN/DE bodies |
| tp-399 | Mekong, f10547 | same fact (it identifies the Mekong) | left; added "longer than the Mississippi, six countries" to the a2110 bodies |
| tp-177 | Dead Sea, f09350 | same fact | left; added the lowest-lying resorts sentence (Ein Bokek) to the a1870 bodies |
| tp-041 | peanut is a legume, f02634 | same fact | left |
| tp-345 | apples and strawberries are Rosaceae, f02095 | same fact (the body lists strawberries) | left |
| tp-303 | fescues and bluegrass are grasses, on f02091 "all cereals are grasses" | **different fact** | wording w13559 moved to a **new fact f14706** (Grasses (Poaceae) / Süßgräser) in a2587 "Measurements of a Football Pitch" |

For f14706, the a2587 body gained a turf-grass sentence: ryegrass, red fescue, sheep's fescue and supine bluegrass, all Poaceae. Its timeline is Linnaeus naming Festuca rubra (1753-05-01) and its source is Wikipedia "Festuca rubra".

## 14. Bank-wide duplicate scan
**Method**
- Grouped facts by normalised `answerEn`. For every pair in different articles, the best-matching EN wordings were scored by the higher of their difflib ratio and their content-word overlap.
- All 1145 pairs scoring ≥ 0.6 were reviewed by hand. 108 were rejected as different facts with the same answer, for example Bavaria largest vs. most museums, March vs. the planet Mars, Lake Superior in North America vs. the world, and the hydrogen of the Sun vs. Jupiter.
- The accepted pairs were clustered. In each cluster every printed fact was kept, plus the lowest id if none was printed. The other, all-generated facts were deleted.

**Result**
- **833 generated duplicate facts deleted** from 562 articles, in 645 clusters.
- No article was emptied. About 46 articles dropped to 1–2 facts, mostly the film-quote and abbreviation collections.
- Most of these duplicates came from the original Quiztopia-era generation rather than this merge. Typical cases:
  - "What does USB stand for?" existed 10× and is now 2× (both printed)
  - "Godfather", "Titanic" and "Forrest Gump" quotes existed 5–7× each
  - Months named after gods
  - Island groups
  - Nobel physics laureates

The full kept ← deleted list is in `scratch/dedupe/item14-list.md`, and the machine-readable plan is in `scratch/dedupe/plan-applied.json`.

**Printed duplicates left in place.** These are near-identical facts that each carry a printed wording, so none was deleted:
- USB: f02159 / f09296
- Google founders: f02096 / f04891 / f13575 (different angles: founding, Alphabet, the 750,000-dollar sale offer)
- Louvre: f01272 / f02291
- Hermitage: f01271 / f02293
- Beaufort scale: f00161 / f00342
- Guggenheim New York: f02294 / f09071
- Basketball / Naismith: f00681 / f06622
- Che Guevara, Bolivia: f03566 / f05788
- Nostromo: f07276 / f10038
- Ramadan: f06336 / f14462 (month of fasting vs. ninth month)

## Articles deleted
a2348, a2395, a2207.

## New fact ids
f14706.

DEDUPE: 14 items · REBUILD: PASS
