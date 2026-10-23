# Campaign Night Relics

On a sealed campaign night, each game's day card and RSVP modal carry its **relic**: one physical object that stands for the game, the way the red d20 stands for a D&D night, with the night's headcount **painted into the art itself**. Each game gets one image per legal player count, so the number is part of the picture at every size — the app never sets text on a relic. The same file is used in the calendar cell (as small as ~38 px on a phone), the modal hero (~112 px) and anywhere else the night is named.

Every file is a **PNG with a fully transparent background**. Drop the raw PNGs into `packages/web/art-src/campaign-relics/<name>.png` (gitignored; the prompts here are the reproducible source). They are converted to `src/assets/campaign-relics/*.webp` by the `card-art --game=relics` script. The app picks `relic-{slug}-{count}`. Counts run from 2 (a night is never one person, so solo counts are left out) to the game's maximum; a count above it can't happen, because only games that fit the headcount can win the night.

---

**Status (2026-10-23):** 80 prompts in 18 batches, one batch per game. Generated and wired in except the two 12+ images (Evil Power Master, Codenames Duet); until those exist a night of twelve or more shows no relic. Convert after adding or replacing any PNG: `pnpm --filter @boardgames/web card-art --game=relics` (writes `src/assets/campaign-relics/`, used by `lib/campaign-relics.ts`).

**How to use.** One game per fresh image-generator conversation:

1. Attach one of that game's generated relics (`art-src/campaign-relics/relic-<slug>-<n>.png`) as the reference image when regenerating or extending a set, and paste the batch's **setup block**.
2. Paste the item prompts in order and save each result under the file name above it. Every item after the first asks for the previous image again with only the numeral changed — keep going in the same conversation so the object stays identical.
3. Check the set side by side: the object, its size and position, and the numeral's lettering, size and position must match across every count. Regenerate any odd one out with its own prompt.

If your generator does not remember the conversation, put the setup block in front of every item prompt instead. Every item prompt repeats the relic, the numeral, the crop, the background and the aspect ratio, so it also works alone.

## Base style directive

Every setup block starts with this, verbatim:

> Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark.

**Player counts** (from the BGG snapshot, `core/src/bgg/snapshot.json`):

| # | Game | Counts | Images | Numeral |
| --- | --- | --- | --- | --- |
| 01 | [Dungeons & Dragons](#batch-01) | 2–8 | 7 | gold-inlaid d20 serif |
| 02 | [Gloomhaven](#batch-02) | 2–4 | 3 | forged iron, riveted |
| 03 | [Frosthaven](#batch-03) | 2–4 | 3 | carved ice, glowing |
| 04 | [Gloomhaven: Jaws of the Lion](#batch-04) | 2–4 | 3 | cast gold house number |
| 05 | [HeroQuest](#batch-05) | 2–5 | 4 | gold medieval serif |
| 06 | [Legends of Andor](#batch-06) | 2–4 | 3 | gold heraldic serif |
| 07 | [Slay the Spire](#batch-07) | 2–4 | 3 | glowing card-energy numeral |
| 08 | [Aeon's End](#batch-08) | 2–4 | 3 | aether-cyan light |
| 09 | [Vantage](#batch-09) | 2–6 | 5 | engraved brass instrument serif |
| 10 | [Escape Tales: The Awakening](#batch-10) | 2–4 | 3 | embossed Victorian brass |
| 11 | [Arcs](#batch-11) | 2–4 | 3 | orange geometric light |
| 12 | [Dorfromantik](#batch-12) | 2–6 | 5 | inlaid cream wood |
| 13 | [War with the Evil Power Master](#batch-13) | 2–11, 12+ | 11 | 80s chrome |
| 14 | [Bomb Busters](#batch-14) | 2–5 | 4 | red LED timer digits |
| 15 | [The Crew: Mission Deep Sea](#batch-15) | 2–5 | 4 | seafoam sonar readout |
| 16 | [The Crew: Quest for Planet Nine](#batch-16) | 2–5 | 4 | moon-white mission patch |
| 17 | [Sky Team](#batch-17) | 2 | 1 | amber altimeter figure |
| 18 | [Codenames Duet](#batch-18) | 2–11, 12+ | 11 | cream stencil |

80 images in all. War with the Evil Power Master and Codenames Duet have no upper limit (Duet is played by two teams sharing the clue-giving, so any table fits); their last image reads **12+** and serves every night of twelve or more.

---

<a id="batch-01"></a>

## Batch 01 · Dungeons & Dragons (7)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a heroic-fantasy relic, the treasure a party carries out of a dungeon: worn but precious, forged metal and cut gems, a little battle damage, the warmth of torchlight on every edge. The relic: a twenty-sided die cut from deep crimson gemstone (#dc2626), its facets shading from bright scarlet to near-black red, every edge inlaid with a thin line of polished gold (#fcd34d); the triangular face pointing at the viewer is slightly darker and carries the numeral. The numeral: engraved into the front triangular face and inlaid with polished gold, in the classic bold serif of a real d20's numbers. This batch is ONE relic drawn 7 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-dungeons-and-dragons-2.png`** — 1:1 square, transparent

```text
The relic: a twenty-sided die cut from deep crimson gemstone (#dc2626), its facets shading from bright scarlet to near-black red, every edge inlaid with a thin line of polished gold (#fcd34d); the triangular face pointing at the viewer is slightly darker and carries the numeral. The numeral on its face is 2, engraved into the front triangular face and inlaid with polished gold, in the classic bold serif of a real d20's numbers, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-dungeons-and-dragons-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the crimson gemstone d20 with gold-inlaid edges, the same view, light, size and position — with only the numeral changed to 3, engraved into the front triangular face and inlaid with polished gold, in the classic bold serif of a real d20's numbers, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-dungeons-and-dragons-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the crimson gemstone d20 with gold-inlaid edges, the same view, light, size and position — with only the numeral changed to 4, engraved into the front triangular face and inlaid with polished gold, in the classic bold serif of a real d20's numbers, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-dungeons-and-dragons-5.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the crimson gemstone d20 with gold-inlaid edges, the same view, light, size and position — with only the numeral changed to 5, engraved into the front triangular face and inlaid with polished gold, in the classic bold serif of a real d20's numbers, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-dungeons-and-dragons-6.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the crimson gemstone d20 with gold-inlaid edges, the same view, light, size and position — with only the numeral changed to 6, engraved into the front triangular face and inlaid with polished gold, in the classic bold serif of a real d20's numbers, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-dungeons-and-dragons-7.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the crimson gemstone d20 with gold-inlaid edges, the same view, light, size and position — with only the numeral changed to 7, engraved into the front triangular face and inlaid with polished gold, in the classic bold serif of a real d20's numbers, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-dungeons-and-dragons-8.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the crimson gemstone d20 with gold-inlaid edges, the same view, light, size and position — with only the numeral changed to 8, engraved into the front triangular face and inlaid with polished gold, in the classic bold serif of a real d20's numbers, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-02"></a>

## Batch 02 · Gloomhaven (3)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a heroic-fantasy relic, the treasure a party carries out of a dungeon: worn but precious, forged metal and cut gems, a little battle damage, the warmth of torchlight on every edge. The relic: a battered heater shield of blackened iron with a scorched-orange enamel field (#c2410c), its rim studded with copper rivets and edged in pale copper (#fed7aa), two notched short swords crossed behind it, an old sword cut across one corner; in the centre a round boss of dark iron ringed with rivets carries the numeral. The numeral: a raised numeral of hammered, forged iron riveted onto the dark boss, its edges catching scorched-orange firelight; heavy, square-cut, battle-worn serif. This batch is ONE relic drawn 3 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-gloomhaven-2.png`** — 1:1 square, transparent

```text
The relic: a battered heater shield of blackened iron with a scorched-orange enamel field (#c2410c), its rim studded with copper rivets and edged in pale copper (#fed7aa), two notched short swords crossed behind it, an old sword cut across one corner; in the centre a round boss of dark iron ringed with rivets carries the numeral. The numeral on its face is 2, a raised numeral of hammered, forged iron riveted onto the dark boss, its edges catching scorched-orange firelight; heavy, square-cut, battle-worn serif, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-gloomhaven-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the battered iron-and-orange heater shield with crossed swords and a dark iron boss, the same view, light, size and position — with only the numeral changed to 3, a raised numeral of hammered, forged iron riveted onto the dark boss, its edges catching scorched-orange firelight; heavy, square-cut, battle-worn serif, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-gloomhaven-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the battered iron-and-orange heater shield with crossed swords and a dark iron boss, the same view, light, size and position — with only the numeral changed to 4, a raised numeral of hammered, forged iron riveted onto the dark boss, its edges catching scorched-orange firelight; heavy, square-cut, battle-worn serif, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-03"></a>

## Batch 03 · Frosthaven (3)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a heroic-fantasy relic, the treasure a party carries out of a dungeon: worn but precious, forged metal and cut gems, a little battle damage, the warmth of torchlight on every edge. The relic: a six-pointed snowflake carved from one block of glacier-blue ice (#60a5fa), each arm a thick faceted crystal with frost-white edges (#e0f2fe), fine rime on its surface and a cold inner glow; in the centre a hexagonal plate of clear dark-blue ice carries the numeral. The numeral: carved deep into the ice plate, its cut edges frost-white and glowing pale icy blue from within; sharp, angular, chiselled serif. This batch is ONE relic drawn 3 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-frosthaven-2.png`** — 1:1 square, transparent

```text
The relic: a six-pointed snowflake carved from one block of glacier-blue ice (#60a5fa), each arm a thick faceted crystal with frost-white edges (#e0f2fe), fine rime on its surface and a cold inner glow; in the centre a hexagonal plate of clear dark-blue ice carries the numeral. The numeral on its face is 2, carved deep into the ice plate, its cut edges frost-white and glowing pale icy blue from within; sharp, angular, chiselled serif, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-frosthaven-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the glacier-blue ice snowflake with its dark-blue hexagonal centre plate, the same view, light, size and position — with only the numeral changed to 3, carved deep into the ice plate, its cut edges frost-white and glowing pale icy blue from within; sharp, angular, chiselled serif, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-frosthaven-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the glacier-blue ice snowflake with its dark-blue hexagonal centre plate, the same view, light, size and position — with only the numeral changed to 4, carved deep into the ice plate, its cut edges frost-white and glowing pale icy blue from within; sharp, angular, chiselled serif, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-04"></a>

## Batch 04 · Gloomhaven: Jaws of the Lion (3)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a heroic-fantasy relic, the treasure a party carries out of a dungeon: worn but precious, forged metal and cut gems, a little battle damage, the warmth of torchlight on every edge. The relic: a heavy lion-head door knocker cast in burnished gold (#d97706): a snarling lion's head with a thick mane, a massive ring hanging from its jaws, the metal worn bright pale gold (#fef3c7) on the high points; the ring frames a round plate of dark bronze that carries the numeral. The numeral: cast in raised polished gold on the dark bronze plate, like an old house number, with a slight worn shine; stately Roman serif. This batch is ONE relic drawn 3 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-gloomhaven-jaws-of-the-lion-2.png`** — 1:1 square, transparent

```text
The relic: a heavy lion-head door knocker cast in burnished gold (#d97706): a snarling lion's head with a thick mane, a massive ring hanging from its jaws, the metal worn bright pale gold (#fef3c7) on the high points; the ring frames a round plate of dark bronze that carries the numeral. The numeral on its face is 2, cast in raised polished gold on the dark bronze plate, like an old house number, with a slight worn shine; stately Roman serif, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-gloomhaven-jaws-of-the-lion-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the burnished gold lion-head door knocker and the dark bronze plate inside its ring, the same view, light, size and position — with only the numeral changed to 3, cast in raised polished gold on the dark bronze plate, like an old house number, with a slight worn shine; stately Roman serif, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-gloomhaven-jaws-of-the-lion-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the burnished gold lion-head door knocker and the dark bronze plate inside its ring, the same view, light, size and position — with only the numeral changed to 4, cast in raised polished gold on the dark bronze plate, like an old house number, with a slight worn shine; stately Roman serif, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-05"></a>

## Batch 05 · HeroQuest (4)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a heroic-fantasy relic, the treasure a party carries out of a dungeon: worn but precious, forged metal and cut gems, a little battle damage, the warmth of torchlight on every edge. The relic: a knight's great helm of dark stone-grey steel (#57534e), front-on with a slight tilt, a short crimson plume (#7f1d1d) on top and a gold band (#fde68a) around the brow; in place of the visor slit a recessed round plate of dark steel carries the numeral. The numeral: embossed in bright gold on the dark steel plate, a bold medieval Roman serif with small spurs, still perfectly legible. This batch is ONE relic drawn 4 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-heroquest-2.png`** — 1:1 square, transparent

```text
The relic: a knight's great helm of dark stone-grey steel (#57534e), front-on with a slight tilt, a short crimson plume (#7f1d1d) on top and a gold band (#fde68a) around the brow; in place of the visor slit a recessed round plate of dark steel carries the numeral. The numeral on its face is 2, embossed in bright gold on the dark steel plate, a bold medieval Roman serif with small spurs, still perfectly legible, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-heroquest-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the stone-grey steel great helm with crimson plume, gold brow band and dark steel face plate, the same view, light, size and position — with only the numeral changed to 3, embossed in bright gold on the dark steel plate, a bold medieval Roman serif with small spurs, still perfectly legible, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-heroquest-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the stone-grey steel great helm with crimson plume, gold brow band and dark steel face plate, the same view, light, size and position — with only the numeral changed to 4, embossed in bright gold on the dark steel plate, a bold medieval Roman serif with small spurs, still perfectly legible, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-heroquest-5.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the stone-grey steel great helm with crimson plume, gold brow band and dark steel face plate, the same view, light, size and position — with only the numeral changed to 5, embossed in bright gold on the dark steel plate, a bold medieval Roman serif with small spurs, still perfectly legible, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-06"></a>

## Batch 06 · Legends of Andor (3)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a heroic-fantasy relic, the treasure a party carries out of a dungeon: worn but precious, forged metal and cut gems, a little battle damage, the warmth of torchlight on every edge. The relic: a round-topped kite shield enamelled forest green (#16a34a), its rim of polished gold (#fcd34d) shaped at the top into three small battlements, gold oak leaves along its lower edge; in the centre a round gold-rimmed plate of deep green enamel carries the numeral. The numeral: painted in polished gold as a heraldic charge on the green enamel, a bold storybook serif with a fine dark outline. This batch is ONE relic drawn 3 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-legends-of-andor-2.png`** — 1:1 square, transparent

```text
The relic: a round-topped kite shield enamelled forest green (#16a34a), its rim of polished gold (#fcd34d) shaped at the top into three small battlements, gold oak leaves along its lower edge; in the centre a round gold-rimmed plate of deep green enamel carries the numeral. The numeral on its face is 2, painted in polished gold as a heraldic charge on the green enamel, a bold storybook serif with a fine dark outline, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-legends-of-andor-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the forest-green kite shield with gold battlements, oak leaves and its round green centre plate, the same view, light, size and position — with only the numeral changed to 3, painted in polished gold as a heraldic charge on the green enamel, a bold storybook serif with a fine dark outline, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-legends-of-andor-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the forest-green kite shield with gold battlements, oak leaves and its round green centre plate, the same view, light, size and position — with only the numeral changed to 4, painted in polished gold as a heraldic charge on the green enamel, a bold storybook serif with a fine dark outline, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-07"></a>

## Batch 07 · Slay the Spire (3)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a heroic-fantasy relic, the treasure a party carries out of a dungeon: worn but precious, forged metal and cut gems, a little battle damage, the warmth of torchlight on every edge. The relic: a jagged obsidian spire, a tall tapering tower of black stone with violet-magenta veins of light (#a21caf) running up its cracks, the tip glowing orchid (#fae8ff), its base a broad stepped gold-trimmed plinth; set into the tower's lower middle, a gold-framed oval of dark polished obsidian carries the numeral. The numeral: a chunky hand-painted numeral glowing orchid (#fae8ff) with a thick dark outline, like the energy number on a Slay the Spire card, upright inside the tall oval. This batch is ONE relic drawn 3 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-slay-the-spire-2.png`** — 1:1 square, transparent

```text
The relic: a jagged obsidian spire, a tall tapering tower of black stone with violet-magenta veins of light (#a21caf) running up its cracks, the tip glowing orchid (#fae8ff), its base a broad stepped gold-trimmed plinth; set into the tower's lower middle, a gold-framed oval of dark polished obsidian carries the numeral. The numeral on its face is 2, a chunky hand-painted numeral glowing orchid (#fae8ff) with a thick dark outline, like the energy number on a Slay the Spire card, upright inside the tall oval, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-slay-the-spire-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the obsidian spire with violet-magenta veins and its gold-framed obsidian oval, the same view, light, size and position — with only the numeral changed to 3, a chunky hand-painted numeral glowing orchid (#fae8ff) with a thick dark outline, like the energy number on a Slay the Spire card, upright inside the tall oval, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-slay-the-spire-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the obsidian spire with violet-magenta veins and its gold-framed obsidian oval, the same view, light, size and position — with only the numeral changed to 4, a chunky hand-painted numeral glowing orchid (#fae8ff) with a thick dark outline, like the energy number on a Slay the Spire card, upright inside the tall oval, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-08"></a>

## Batch 08 · Aeon's End (3)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a heroic-fantasy relic, the treasure a party carries out of a dungeon: worn but precious, forged metal and cut gems, a little battle damage, the warmth of torchlight on every edge. The relic: a breach ring: a thick circular frame of dark bronze carved with spiralling bands, glowing from within with breach-indigo energy (#6366f1) and threads of aether cyan (#a5f3fc) leaking from its seams; the ring holds a round disc of deep indigo glass that carries the numeral. The numeral: formed of bright aether-cyan light (#a5f3fc) hovering inside the indigo glass, crackling faintly at its edges; crisp arcane serif. This batch is ONE relic drawn 3 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-aeons-end-2.png`** — 1:1 square, transparent

```text
The relic: a breach ring: a thick circular frame of dark bronze carved with spiralling bands, glowing from within with breach-indigo energy (#6366f1) and threads of aether cyan (#a5f3fc) leaking from its seams; the ring holds a round disc of deep indigo glass that carries the numeral. The numeral on its face is 2, formed of bright aether-cyan light (#a5f3fc) hovering inside the indigo glass, crackling faintly at its edges; crisp arcane serif, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-aeons-end-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the spiralling dark-bronze breach ring and its deep indigo glass disc, the same view, light, size and position — with only the numeral changed to 3, formed of bright aether-cyan light (#a5f3fc) hovering inside the indigo glass, crackling faintly at its edges; crisp arcane serif, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-aeons-end-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the spiralling dark-bronze breach ring and its deep indigo glass disc, the same view, light, size and position — with only the numeral changed to 4, formed of bright aether-cyan light (#a5f3fc) hovering inside the indigo glass, crackling faintly at its edges; crisp arcane serif, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-09"></a>

## Batch 09 · Vantage (5)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a storyteller's keepsake, the kind of object that marks where a long story stopped: handled for many evenings, softer and more crafted than a dungeon's loot. The relic: an explorer's compass rose: an eight-pointed star of twilight-violet enamel (#8b5cf6) on a ring of polished brass, the four long points tipped in lavender (#ede9fe), a faint starfield painted inside the ring; in the centre a round brass-rimmed cap of dark violet glass carries the numeral. The numeral: engraved in fine polished brass on the violet glass, a slender explorer's-instrument serif like the figures on an old sextant. This batch is ONE relic drawn 5 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-vantage-2.png`** — 1:1 square, transparent

```text
The relic: an explorer's compass rose: an eight-pointed star of twilight-violet enamel (#8b5cf6) on a ring of polished brass, the four long points tipped in lavender (#ede9fe), a faint starfield painted inside the ring; in the centre a round brass-rimmed cap of dark violet glass carries the numeral. The numeral on its face is 2, engraved in fine polished brass on the violet glass, a slender explorer's-instrument serif like the figures on an old sextant, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-vantage-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the violet-and-brass compass rose and its dark violet glass centre cap, the same view, light, size and position — with only the numeral changed to 3, engraved in fine polished brass on the violet glass, a slender explorer's-instrument serif like the figures on an old sextant, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-vantage-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the violet-and-brass compass rose and its dark violet glass centre cap, the same view, light, size and position — with only the numeral changed to 4, engraved in fine polished brass on the violet glass, a slender explorer's-instrument serif like the figures on an old sextant, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-vantage-5.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the violet-and-brass compass rose and its dark violet glass centre cap, the same view, light, size and position — with only the numeral changed to 5, engraved in fine polished brass on the violet glass, a slender explorer's-instrument serif like the figures on an old sextant, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-vantage-6.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the violet-and-brass compass rose and its dark violet glass centre cap, the same view, light, size and position — with only the numeral changed to 6, engraved in fine polished brass on the violet glass, a slender explorer's-instrument serif like the figures on an old sextant, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-10"></a>

## Batch 10 · Escape Tales: The Awakening (3)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a storyteller's keepsake, the kind of object that marks where a long story stopped: handled for many evenings, softer and more crafted than a dungeon's loot. The relic: an antique keyhole escutcheon: an ornate scrolled plate of tarnished candle-ochre brass (#ca8a04), a large old skeleton key resting diagonally across its lower edge, warm pale-yellow light (#fef9c3) glowing faintly from behind; in place of the keyhole a round plate of dark aged brass carries the numeral. The numeral: stamped and embossed in bright aged brass on the dark plate, a Victorian lock-maker's serif with a little ornament. This batch is ONE relic drawn 3 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-escape-tales-the-awakening-2.png`** — 1:1 square, transparent

```text
The relic: an antique keyhole escutcheon: an ornate scrolled plate of tarnished candle-ochre brass (#ca8a04), a large old skeleton key resting diagonally across its lower edge, warm pale-yellow light (#fef9c3) glowing faintly from behind; in place of the keyhole a round plate of dark aged brass carries the numeral. The numeral on its face is 2, stamped and embossed in bright aged brass on the dark plate, a Victorian lock-maker's serif with a little ornament, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-escape-tales-the-awakening-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the ornate ochre-brass escutcheon with the skeleton key and its dark round plate, the same view, light, size and position — with only the numeral changed to 3, stamped and embossed in bright aged brass on the dark plate, a Victorian lock-maker's serif with a little ornament, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-escape-tales-the-awakening-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the ornate ochre-brass escutcheon with the skeleton key and its dark round plate, the same view, light, size and position — with only the numeral changed to 4, stamped and embossed in bright aged brass on the dark plate, a Victorian lock-maker's serif with a little ornament, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-11"></a>

## Batch 11 · Arcs (3)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a storyteller's keepsake, the kind of object that marks where a long story stopped: handled for many evenings, softer and more crafted than a dungeon's loot. The relic: a sci-fi ambition sigil: a bold six-pointed starburst of ember-orange enamel (#fb923c) on a disc of deep navy metal (#172554), its points edged in peach light (#fed7aa), a thin orbit ring crossing behind it at an angle; in the centre a gold-rimmed octagonal plate of dark navy carries the numeral. The numeral: inset as clean ember-orange light (#fb923c) into the navy octagon, a wide geometric sci-fi numeral with squared curves. This batch is ONE relic drawn 3 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-arcs-2.png`** — 1:1 square, transparent

```text
The relic: a sci-fi ambition sigil: a bold six-pointed starburst of ember-orange enamel (#fb923c) on a disc of deep navy metal (#172554), its points edged in peach light (#fed7aa), a thin orbit ring crossing behind it at an angle; in the centre a gold-rimmed octagonal plate of dark navy carries the numeral. The numeral on its face is 2, inset as clean ember-orange light (#fb923c) into the navy octagon, a wide geometric sci-fi numeral with squared curves, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-arcs-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the ember-orange starburst on the navy disc with its orbit ring and dark navy octagon, the same view, light, size and position — with only the numeral changed to 3, inset as clean ember-orange light (#fb923c) into the navy octagon, a wide geometric sci-fi numeral with squared curves, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-arcs-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the ember-orange starburst on the navy disc with its orbit ring and dark navy octagon, the same view, light, size and position — with only the numeral changed to 4, inset as clean ember-orange light (#fb923c) into the navy octagon, a wide geometric sci-fi numeral with squared curves, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-12"></a>

## Batch 12 · Dorfromantik (5)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a storyteller's keepsake, the kind of object that marks where a long story stopped: handled for many evenings, softer and more crafted than a dungeon's loot. The relic: one thick hexagonal landscape tile like a chunky wooden game piece: meadow-green fields (#65a30d) and straw-yellow wheat (#fef08a) around its rim, a winding river-blue stream (#7dd3fc), tiny red-roofed cottages and a small forest at the edges, its wooden sides visible; in the centre of the top face a round clearing of smooth darker green grass carries the numeral. The numeral: a chunky rounded numeral of pale cream wood inlaid flush into the clearing, like a hand-carved game piece, seen at the same slight top-down angle as the tile. This batch is ONE relic drawn 5 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-dorfromantik-2.png`** — 1:1 square, transparent

```text
The relic: one thick hexagonal landscape tile like a chunky wooden game piece: meadow-green fields (#65a30d) and straw-yellow wheat (#fef08a) around its rim, a winding river-blue stream (#7dd3fc), tiny red-roofed cottages and a small forest at the edges, its wooden sides visible; in the centre of the top face a round clearing of smooth darker green grass carries the numeral. The numeral on its face is 2, a chunky rounded numeral of pale cream wood inlaid flush into the clearing, like a hand-carved game piece, seen at the same slight top-down angle as the tile, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-dorfromantik-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the hexagonal landscape tile with fields, river and cottages and its green clearing, the same view, light, size and position — with only the numeral changed to 3, a chunky rounded numeral of pale cream wood inlaid flush into the clearing, like a hand-carved game piece, seen at the same slight top-down angle as the tile, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-dorfromantik-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the hexagonal landscape tile with fields, river and cottages and its green clearing, the same view, light, size and position — with only the numeral changed to 4, a chunky rounded numeral of pale cream wood inlaid flush into the clearing, like a hand-carved game piece, seen at the same slight top-down angle as the tile, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-dorfromantik-5.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the hexagonal landscape tile with fields, river and cottages and its green clearing, the same view, light, size and position — with only the numeral changed to 5, a chunky rounded numeral of pale cream wood inlaid flush into the clearing, like a hand-carved game piece, seen at the same slight top-down angle as the tile, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-dorfromantik-6.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the hexagonal landscape tile with fields, river and cottages and its green clearing, the same view, light, size and position — with only the numeral changed to 6, a chunky rounded numeral of pale cream wood inlaid flush into the clearing, like a hand-carved game piece, seen at the same slight top-down angle as the tile, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-13"></a>

## Batch 13 · War with the Evil Power Master (11)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a storyteller's keepsake, the kind of object that marks where a long story stopped: handled for many evenings, softer and more crafted than a dungeon's loot. The relic: a 1980s space-squadron badge: a chunky shield of navy enamel (#1e3a8a) with a bold signal-red lightning bolt (#b91c1c) across it, chrome edges catching sky-blue light (#bfdbfe), two gold wings (#fbbf24) at its shoulders, in the bright airbrushed finish of an 80s paperback cover; in the centre a round chrome-rimmed plate of dark navy carries the numeral. The numeral: in gleaming 1980s chrome lettering with a sky-blue airbrushed sheen and a hot gold highlight, chunky upright retro sci-fi type. This batch is ONE relic drawn 11 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-war-with-the-evil-power-master-2.png`** — 1:1 square, transparent

```text
The relic: a 1980s space-squadron badge: a chunky shield of navy enamel (#1e3a8a) with a bold signal-red lightning bolt (#b91c1c) across it, chrome edges catching sky-blue light (#bfdbfe), two gold wings (#fbbf24) at its shoulders, in the bright airbrushed finish of an 80s paperback cover; in the centre a round chrome-rimmed plate of dark navy carries the numeral. The numeral on its face is 2, in gleaming 1980s chrome lettering with a sky-blue airbrushed sheen and a hot gold highlight, chunky upright retro sci-fi type, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-war-with-the-evil-power-master-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the navy-and-red winged squadron badge with its chrome-rimmed navy plate, the same view, light, size and position — with only the numeral changed to 3, in gleaming 1980s chrome lettering with a sky-blue airbrushed sheen and a hot gold highlight, chunky upright retro sci-fi type, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-war-with-the-evil-power-master-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the navy-and-red winged squadron badge with its chrome-rimmed navy plate, the same view, light, size and position — with only the numeral changed to 4, in gleaming 1980s chrome lettering with a sky-blue airbrushed sheen and a hot gold highlight, chunky upright retro sci-fi type, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-war-with-the-evil-power-master-5.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the navy-and-red winged squadron badge with its chrome-rimmed navy plate, the same view, light, size and position — with only the numeral changed to 5, in gleaming 1980s chrome lettering with a sky-blue airbrushed sheen and a hot gold highlight, chunky upright retro sci-fi type, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-war-with-the-evil-power-master-6.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the navy-and-red winged squadron badge with its chrome-rimmed navy plate, the same view, light, size and position — with only the numeral changed to 6, in gleaming 1980s chrome lettering with a sky-blue airbrushed sheen and a hot gold highlight, chunky upright retro sci-fi type, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-war-with-the-evil-power-master-7.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the navy-and-red winged squadron badge with its chrome-rimmed navy plate, the same view, light, size and position — with only the numeral changed to 7, in gleaming 1980s chrome lettering with a sky-blue airbrushed sheen and a hot gold highlight, chunky upright retro sci-fi type, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-war-with-the-evil-power-master-8.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the navy-and-red winged squadron badge with its chrome-rimmed navy plate, the same view, light, size and position — with only the numeral changed to 8, in gleaming 1980s chrome lettering with a sky-blue airbrushed sheen and a hot gold highlight, chunky upright retro sci-fi type, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-war-with-the-evil-power-master-9.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the navy-and-red winged squadron badge with its chrome-rimmed navy plate, the same view, light, size and position — with only the numeral changed to 9, in gleaming 1980s chrome lettering with a sky-blue airbrushed sheen and a hot gold highlight, chunky upright retro sci-fi type, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-war-with-the-evil-power-master-10.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the navy-and-red winged squadron badge with its chrome-rimmed navy plate, the same view, light, size and position — with only the numeral changed to 10, in gleaming 1980s chrome lettering with a sky-blue airbrushed sheen and a hot gold highlight, chunky upright retro sci-fi type, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-war-with-the-evil-power-master-11.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the navy-and-red winged squadron badge with its chrome-rimmed navy plate, the same view, light, size and position — with only the numeral changed to 11, in gleaming 1980s chrome lettering with a sky-blue airbrushed sheen and a hot gold highlight, chunky upright retro sci-fi type, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-war-with-the-evil-power-master-12plus.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the navy-and-red winged squadron badge with its chrome-rimmed navy plate, the same view, light, size and position — with only the numeral changed to 12+ (the digits 1 and 2 followed by a small plus sign), in gleaming 1980s chrome lettering with a sky-blue airbrushed sheen and a hot gold highlight, chunky upright retro sci-fi type, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-14"></a>

## Batch 14 · Bomb Busters (4)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a piece of mission hardware, the equipment of a crew working through a numbered ladder of missions: enamel, brass and glass, cleaner and more engineered than fantasy treasure, with the same deluxe painted finish. The relic: a round bomb casing of faceted alarm-rose enamel (#e11d48), a short lit fuse sparking pale pink (#ffe4e6) on top, three thick wires (red, blue, yellow) looping across its front into a small brass clamp; on its front a round brass-rimmed timer face of dark glass carries the numeral. The numeral: glowing red seven-segment LED digits on the dark timer glass, like a countdown display, with a faint red bloom. This batch is ONE relic drawn 4 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-bomb-busters-2.png`** — 1:1 square, transparent

```text
The relic: a round bomb casing of faceted alarm-rose enamel (#e11d48), a short lit fuse sparking pale pink (#ffe4e6) on top, three thick wires (red, blue, yellow) looping across its front into a small brass clamp; on its front a round brass-rimmed timer face of dark glass carries the numeral. The numeral on its face is 2, glowing red seven-segment LED digits on the dark timer glass, like a countdown display, with a faint red bloom, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-bomb-busters-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the alarm-rose bomb with lit fuse, red-blue-yellow wires and its dark glass timer face, the same view, light, size and position — with only the numeral changed to 3, glowing red seven-segment LED digits on the dark timer glass, like a countdown display, with a faint red bloom, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-bomb-busters-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the alarm-rose bomb with lit fuse, red-blue-yellow wires and its dark glass timer face, the same view, light, size and position — with only the numeral changed to 4, glowing red seven-segment LED digits on the dark timer glass, like a countdown display, with a faint red bloom, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-bomb-busters-5.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the alarm-rose bomb with lit fuse, red-blue-yellow wires and its dark glass timer face, the same view, light, size and position — with only the numeral changed to 5, glowing red seven-segment LED digits on the dark timer glass, like a countdown display, with a faint red bloom, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-15"></a>

## Batch 15 · The Crew: Mission Deep Sea (4)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a piece of mission hardware, the equipment of a crew working through a numbered ladder of missions: enamel, brass and glass, cleaner and more engineered than fantasy treasure, with the same deluxe painted finish. The relic: a submarine porthole: a heavy round brass frame with eight bolts, its thick glass filled with deep teal water (#0d9488), seafoam bubbles (#ccfbf1) rising inside and a faint sonar ring of light; in the centre of the glass a round disc of dark teal carries the numeral. The numeral: lit in seafoam light (#ccfbf1) like a sonar depth readout, a clean rounded instrument numeral with a soft glow. This batch is ONE relic drawn 4 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-the-crew-mission-deep-sea-2.png`** — 1:1 square, transparent

```text
The relic: a submarine porthole: a heavy round brass frame with eight bolts, its thick glass filled with deep teal water (#0d9488), seafoam bubbles (#ccfbf1) rising inside and a faint sonar ring of light; in the centre of the glass a round disc of dark teal carries the numeral. The numeral on its face is 2, lit in seafoam light (#ccfbf1) like a sonar depth readout, a clean rounded instrument numeral with a soft glow, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-the-crew-mission-deep-sea-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the bolted brass porthole full of teal water and its dark teal centre disc, the same view, light, size and position — with only the numeral changed to 3, lit in seafoam light (#ccfbf1) like a sonar depth readout, a clean rounded instrument numeral with a soft glow, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-the-crew-mission-deep-sea-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the bolted brass porthole full of teal water and its dark teal centre disc, the same view, light, size and position — with only the numeral changed to 4, lit in seafoam light (#ccfbf1) like a sonar depth readout, a clean rounded instrument numeral with a soft glow, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-the-crew-mission-deep-sea-5.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the bolted brass porthole full of teal water and its dark teal centre disc, the same view, light, size and position — with only the numeral changed to 5, lit in seafoam light (#ccfbf1) like a sonar depth readout, a clean rounded instrument numeral with a soft glow, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-16"></a>

## Batch 16 · The Crew: Quest for Planet Nine (4)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a piece of mission hardware, the equipment of a crew working through a numbered ladder of missions: enamel, brass and glass, cleaner and more engineered than fantasy treasure, with the same deluxe painted finish. The relic: a ringed planet of banded space-indigo enamel (#4f46e5), a thick moon-white ring (#e0e7ff) tilted across it, one small silver moon close by; on the planet's face, inside a gold rim, a round plate of dark indigo carries the numeral. The numeral: in clean moon-white mission-patch lettering (#e0e7ff), a sturdy rounded space-agency numeral with a faint glow. This batch is ONE relic drawn 4 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-the-crew-quest-for-planet-nine-2.png`** — 1:1 square, transparent

```text
The relic: a ringed planet of banded space-indigo enamel (#4f46e5), a thick moon-white ring (#e0e7ff) tilted across it, one small silver moon close by; on the planet's face, inside a gold rim, a round plate of dark indigo carries the numeral. The numeral on its face is 2, in clean moon-white mission-patch lettering (#e0e7ff), a sturdy rounded space-agency numeral with a faint glow, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-the-crew-quest-for-planet-nine-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the banded indigo ringed planet with its silver moon and gold-rimmed dark plate, the same view, light, size and position — with only the numeral changed to 3, in clean moon-white mission-patch lettering (#e0e7ff), a sturdy rounded space-agency numeral with a faint glow, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-the-crew-quest-for-planet-nine-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the banded indigo ringed planet with its silver moon and gold-rimmed dark plate, the same view, light, size and position — with only the numeral changed to 4, in clean moon-white mission-patch lettering (#e0e7ff), a sturdy rounded space-agency numeral with a faint glow, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-the-crew-quest-for-planet-nine-5.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the banded indigo ringed planet with its silver moon and gold-rimmed dark plate, the same view, light, size and position — with only the numeral changed to 5, in clean moon-white mission-patch lettering (#e0e7ff), a sturdy rounded space-agency numeral with a faint glow, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-17"></a>

## Batch 17 · Sky Team (1)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a piece of mission hardware, the equipment of a crew working through a numbered ladder of missions: enamel, brass and glass, cleaner and more engineered than fantasy treasure, with the same deluxe painted finish. The relic: an aircraft cockpit gauge: a round instrument in a chunky polished gold bezel, its dial cockpit blue (#0284c7), a ring of tick marks and a small aeroplane silhouette at the top, with NO needle; in the centre a round hub of dark glass carries the numeral. The numeral: in instrument amber (#fde68a), a clean aviation-gauge numeral like the figures on an altimeter, glowing softly. This batch is a single image.
```

**`relic-sky-team-2.png`** — 1:1 square, transparent

```text
The relic: an aircraft cockpit gauge: a round instrument in a chunky polished gold bezel, its dial cockpit blue (#0284c7), a ring of tick marks and a small aeroplane silhouette at the top, with NO needle; in the centre a round hub of dark glass carries the numeral. The numeral on its face is 2, in instrument amber (#fde68a), a clean aviation-gauge numeral like the figures on an altimeter, glowing softly, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-18"></a>

## Batch 18 · Codenames Duet (11)

**Setup block** — paste first:

```text
Premium collectible game-piece illustration: one physical relic object painted like a deluxe sculpted game token, semi-realistic digital painting with crisp, confident edges; glossy enamel, polished metal, cut gemstone and carved stone surfaces; a warm key light from the upper left, a bright thin rim light tracing the whole silhouette and a soft inner glow in the object's own colour, so it reads clearly against a near-black warm charcoal page (#1a1816). The colour this prompt names leads the object. The silhouette is simple, bold and instantly recognisable even at 40 pixels: one strong shape, no thin protruding parts, no small loose details. In the middle of the object, facing the viewer, its face carries ONE large numeral, made as part of the object itself in the material and lettering this prompt names: it fills most of the face, sits upright and dead centre on it, and is bold and high-contrast so it reads instantly at 40 pixels. No other text, letters or numbers anywhere on the object; no signature, no watermark. This is a piece of mission hardware, the equipment of a crew working through a numbered ladder of missions: enamel, brass and glass, cleaner and more engineered than fantasy treasure, with the same deluxe painted finish. The relic: a spy's key card in a dark leather and brass holder, its face a five-by-five grid of agent-green (#16a34a) and card-tan (#e7dcc0) squares with one black square, slightly glowing like backlit glass; the middle of the grid is a single larger gold-framed plate of dark green glass that carries the numeral. The numeral: in cream stencil lettering (#e7dcc0), like a code stamped on an agent's card, crisp and bold. This batch is ONE relic drawn 11 times, once per player count: every image is the identical object, the same camera, the same three-quarter view tilted about 15 degrees, the same light, the same size and position on the canvas, the same numeral lettering, size and placement. Only the numeral changes. A two-character numeral is set a little narrower so it stays inside the same face.
```

**`relic-codenames-duet-2.png`** — 1:1 square, transparent

```text
The relic: a spy's key card in a dark leather and brass holder, its face a five-by-five grid of agent-green (#16a34a) and card-tan (#e7dcc0) squares with one black square, slightly glowing like backlit glass; the middle of the grid is a single larger gold-framed plate of dark green glass that carries the numeral. The numeral on its face is 2, in cream stencil lettering (#e7dcc0), like a code stamped on an agent's card, crisp and bold, filling most of the face and dead centre on it. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-codenames-duet-3.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the green-and-tan spy key card in its leather holder, the same view, light, size and position — with only the numeral changed to 3, in cream stencil lettering (#e7dcc0), like a code stamped on an agent's card, crisp and bold, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-codenames-duet-4.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the green-and-tan spy key card in its leather holder, the same view, light, size and position — with only the numeral changed to 4, in cream stencil lettering (#e7dcc0), like a code stamped on an agent's card, crisp and bold, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-codenames-duet-5.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the green-and-tan spy key card in its leather holder, the same view, light, size and position — with only the numeral changed to 5, in cream stencil lettering (#e7dcc0), like a code stamped on an agent's card, crisp and bold, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-codenames-duet-6.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the green-and-tan spy key card in its leather holder, the same view, light, size and position — with only the numeral changed to 6, in cream stencil lettering (#e7dcc0), like a code stamped on an agent's card, crisp and bold, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-codenames-duet-7.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the green-and-tan spy key card in its leather holder, the same view, light, size and position — with only the numeral changed to 7, in cream stencil lettering (#e7dcc0), like a code stamped on an agent's card, crisp and bold, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-codenames-duet-8.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the green-and-tan spy key card in its leather holder, the same view, light, size and position — with only the numeral changed to 8, in cream stencil lettering (#e7dcc0), like a code stamped on an agent's card, crisp and bold, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-codenames-duet-9.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the green-and-tan spy key card in its leather holder, the same view, light, size and position — with only the numeral changed to 9, in cream stencil lettering (#e7dcc0), like a code stamped on an agent's card, crisp and bold, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-codenames-duet-10.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the green-and-tan spy key card in its leather holder, the same view, light, size and position — with only the numeral changed to 10, in cream stencil lettering (#e7dcc0), like a code stamped on an agent's card, crisp and bold, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-codenames-duet-11.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the green-and-tan spy key card in its leather holder, the same view, light, size and position — with only the numeral changed to 11, in cream stencil lettering (#e7dcc0), like a code stamped on an agent's card, crisp and bold, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```

**`relic-codenames-duet-12plus.png`** — 1:1 square, transparent

```text
The same image as the previous one, identical in every detail — the green-and-tan spy key card in its leather holder, the same view, light, size and position — with only the numeral changed to 12+ (the digits 1 and 2 followed by a small plus sign), in cream stencil lettering (#e7dcc0), like a code stamped on an agent's card, crisp and bold, in exactly the same size and position as before. The relic centred and filling about 88% of the canvas, seen in a slight three-quarter view. Isolated on a fully transparent background, no cast shadow, no text other than the numeral, no watermark. Square composition, 1:1 aspect ratio.
```
