# 7 Wonders Art

Everything the board draws that isn't a printed card: the seven Wonders by day and by night, their crests, the Age card backs, the tokens and coins, the icons, the score-pad emblems, the Edifice projects, the backdrops and the surfaces. The **cards themselves stay BGA's printed second-edition faces** (`assets/cards.webp`); this art is made to sit beside them, so the base style below describes that card art and every icon matches the round icons printed on the cards.

The prompts generate **only pictures** — no names, numbers or rules text; the board adds those.

Every file is a **PNG with a fully transparent background** unless its prompt says *opaque*. Drop the raw PNGs into `packages/web/art-src/7-wonders/<name>.png` (gitignored — the prompts here are the reproducible source). They are converted to `assets/art/*.webp` when they're wired in.

---

**Status (2026-10-15):** 110 prompts in 15 batches of at most 10. All generated and wired in: `assets/art/*.webp` (manifest in `assets/art/manifest.json`, convert with `pnpm --filter @boardgames/web card-art --game=7-wonders`). The menu backdrop (`assets/background.png`) is a separate night-harbour painting.

**How to use.** Work one batch at a time, in a fresh image-generator conversation:

1. Paste the batch's **setup block** first. It is the base style directive followed by the batch's own directive, so everything in the batch shares one look.
2. Then paste each item prompt of that batch in turn and save the result under the file name above it, in `packages/web/art-src/7-wonders/`.

If your generator does not remember the conversation, put the setup block in front of every item prompt instead. Every item prompt repeats its own crop, background and aspect ratio, so it also works alone.

## Base style directive

Every setup block starts with this, verbatim — except the Age card backs and the Edifice blueprints (drawn, not painted: their own directive) and the two Wonder-board batches, which drop the shared light and palette so each Wonder keeps its own:

> Painterly digital illustration in the manner of the 7 Wonders second-edition card art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; warm golden Mediterranean light against deep cool shadows; a rich palette of terracotta, ochre, sand, lapis blue, verdigris green and marble white, with the colour this prompt names leading the picture; the monumental ancient world of Egypt, Mesopotamia, Persia, Greece and Rome shown as living, prosperous, busy places; cinematic depth with a light haze and drifting dust in the air; heroic in scale, warm and inviting, never grim and never gory. No modern elements, no text, no lettering, no numbers, no signature, no watermark.

**Palette words** (they match `logic/wonder-style.ts` and `card-utils.ts` `COLOR_HEX`):

| Role | Colour |
| --- | --- |
| Giza | desert gold #c99a52 |
| Babylon | garden green #3f8a5e |
| Olympia | storm slate blue #7484ad |
| Rhodes | bronze #b9813f, sea blue #1d3550 |
| Ephesos | rose marble #b0807a |
| Alexandria | Mediterranean blue #2f78aa |
| Halikarnassos | royal violet #7d5c9c |
| Age I | sandstone #8a5a2b |
| Age II | lapis #24477a |
| Age III | imperial purple #5b2e78 |
| Gold leaf | #d9a520 |
| Age backs (2nd edition) | I copper #d0643a, II rose-champagne #d2ad9c, III gold #e6a630, on espresso #2a1f1a |

---

## Files

| File | Aspect ratio | Block | Used on |
| --- | --- | --- | --- |
| `wonder-{id}-day.png` ×7 | 21:9 opaque | Day-side board panorama | City view wonder board (side A), Table view |
| `wonder-{id}-night.png` ×7 | 21:9 opaque | Night-side board panorama | City view wonder board (side B) |
| `crest-{id}.png` ×7 | 1:1 | round crest | navigator, Overview header, Table tokens, war reveal |
| `emblem-seven-wonders.png` | 1:1 | game emblem | setup screen, Age gauge |
| `back-age-{1,2,3}.png` | 2:3 opaque | Age card back | tucked stage cards, sold cards, discard pile |
| `token-*.png`, `coin-*.png` ×9 | 1:1 | physical pieces | borders, war reveal, treasury, Edifice |
| `icon-*.png` ×20 | 1:1 | resource, science and game icons | everywhere a cost, effect or count is shown |
| `score-*.png` ×8 | 1:1 | score-pad categories | score bar, Overview, results |
| `edifice-{project}-blueprint.png` ×15 | 2:3 opaque | Edifice architect's plan | Edifice view tile while the project is open |
| `edifice-{project}.png` ×15 | 2:3 opaque | Edifice project built | Edifice view tile once the project is built |
| `bg-*.png` ×8 | 16:9 opaque | backdrops | table, setup, Age starts, war, results, Table-view map |
| `nav-*.png` ×4 | 1:1 | rail medallions | the left rail's Table, Overview, Chains and Edifice rows |
| `tex-*.png`, `band-*.png`, `frame-*.png`, `ornament-*.png`, `plaque-*.png` | various | surfaces and ornaments | panels, borders, VP badges, stage slots |

## Batches

| # | Batch | Prompts |
| --- | --- | --- |
| 01 | [Wonders by day](#batch-01) | 7 |
| 02 | [Wonders by night](#batch-02) | 7 |
| 03 | [Wonder crests and the game emblem](#batch-03) | 8 |
| 04 | [Age card backs](#batch-04) | 3 |
| 05 | [Tokens](#batch-05) | 9 |
| 06 | [Icons I — resources and science](#batch-06) | 10 |
| 07 | [Icons II — game symbols](#batch-07) | 10 |
| 08 | [Icons III — the score pad](#batch-08) | 8 |
| 09 | [Edifice blueprints I — Ages I and II](#batch-09) | 10 |
| 10 | [Edifice blueprints II — Age III](#batch-10) | 5 |
| 11 | [Edifice projects built I — Ages I and II](#batch-11) | 10 |
| 12 | [Edifice projects built II — Age III](#batch-12) | 5 |
| 13 | [Scenes and backgrounds](#batch-13) | 8 |
| 14 | [Surfaces and ornaments](#batch-14) | 6 |
| 15 | [Rail medallions](#batch-15) | 4 |
| | **Total** | **110** |

---

<a id="batch-01"></a>

## Batch 01 · Wonders by day (7)

**Setup block** — paste first:

```text
Painterly digital illustration in the manner of the 7 Wonders second-edition card art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; the monumental ancient world of Egypt, Mesopotamia, Persia, Greece and Rome shown as living, prosperous places; cinematic depth, heroic in scale, never gory. No modern elements, no text, no lettering, no numbers, no signature, no watermark. This batch is the Day side of the seven Wonder boards. Each Wonder has one fixed composition that its Night board will repeat exactly; here it is in daylight (Giza at a red sunset, the rest by day). Each board is its own painting and the seven must NOT look uniform: every Wonder has its own camera (aerial, straight down, eye-level, interior, from the water) and its own dominant colours, all named in its prompt — follow them exactly and never drift back to a generic eye-level view. The only thing the set shares is the format: a wide board panorama whose lower third will later sit under a row of stage plaques and whose top-left corner will carry the Wonder's emblem, so the Wonder's defining shape reads clearly in the upper two-thirds and the lower third stays painted but calmer. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`wonder-giza-day.png`** — 21:9 panorama, opaque

```text
The Pyramids of Giza seen from far across the open desert: the three pyramids on the horizon in the centre-right, the Sphinx's head rising from the sand at the far left, a camel caravan along a dune crest on the right. Camera: eye-level, very wide, distant. At sunset: a burning orange-red sky with long streaks of cloud, the sun touching the dunes, the pyramids glowing peach, the Sphinx and the caravan in dark silhouette. Dominant colours: fiery orange, red and rust sand. The Wonder's defining shape reads clearly in the upper two-thirds; the lower third stays painted but calmer, and the top-left corner is quiet. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`wonder-ephesos-day.png`** — 21:9 panorama, opaque

```text
The Temple of Artemis at Ephesos seen from high above at a three-quarter aerial angle: the whole vast Ionic temple on its stepped marble platform, a double forest of white columns, a painted pediment, wide stairs with a procession, cypress and olive groves and the river plain around it. On a clear golden morning, the marble warm cream, the procession bright with coloured robes. Dominant colours: honey gold, cream marble and sage green under a pale yellow sky. The Wonder's defining shape reads clearly in the upper two-thirds; the lower third stays painted but calmer, and the top-left corner is quiet. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`wonder-olympia-day.png`** — 21:9 panorama, opaque

```text
Inside the Temple of Zeus at Olympia: the colossal seated Zeus of gold and ivory towering at the end of the hall on the right, a winged Victory in his palm and an eagle on his sceptre, rows of giant columns receding on both sides, a reflecting pool on the floor, tiny pilgrims at his feet for scale. Camera: interior, low angle looking up along the nave. By day: shafts of sunlight falling through the roof openings and incense haze, the statue blazing gold. Dominant colours: molten gold, ivory and warm amber. The Wonder's defining shape reads clearly in the upper two-thirds; the lower third stays painted but calmer, and the top-left corner is quiet. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`wonder-babylon-day.png`** — 21:9 panorama, opaque

```text
The Hanging Gardens of Babylon seen almost straight down from a bird's-eye view: a round tiered garden-tower left of centre ringed by stepped terraces, a grid of red-brick walls, courtyards, canals and pools around it, every terrace dense with palms and vines. Camera: high aerial looking almost straight down, like a map. At bright midday: canals and pools sparkling, gardeners and water-carriers on the walkways. Dominant colours: brick red and terracotta against vivid emerald green. The Wonder's defining shape reads clearly in the upper two-thirds; the lower third stays painted but calmer, and the top-left corner is quiet. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`wonder-alexandria-day.png`** — 21:9 panorama, opaque

```text
The Lighthouse of Alexandria seen from the open sea: the white three-tiered Pharos on its rocky island left of centre, waves breaking on the rocks, a merchant ship in the foreground right. Camera: low, from the waves. On a bright, breezy day: a clear sky with high white clouds, sparkling turquoise sea, the ship and others with full white sails, gulls. Dominant colours: brilliant white and turquoise, deep sea blue. The Wonder's defining shape reads clearly in the upper two-thirds; the lower third stays painted but calmer, and the top-left corner is quiet. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`wonder-halikarnassos-day.png`** — 21:9 panorama, opaque

```text
The Mausoleum of Halikarnassos seen from across the bay: the tall tomb on its high podium at the left, Ionic columns with statues, a stepped roof with a marble four-horse chariot at the peak, cypresses and the harbour town along the shore, the calm bay in front. Camera: eye-level from across the water, wide. On a clear bright morning: white and pale pink marble shining, small boats on the blue bay, a soft blue sky. Dominant colours: clear azure, warm white marble and dark cypress green. The Wonder's defining shape reads clearly in the upper two-thirds; the lower third stays painted but calmer, and the top-left corner is quiet. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`wonder-rhodes-day.png`** — 21:9 panorama, opaque

```text
The Colossus of Rhodes in a dramatic close aerial view: the bronze Helios looming huge over the right third of the frame, only his crowned head, shoulder and the arm raising a torch toward the viewer in view; far below him the whole city of Rhodes spreads to the left, a dense maze of tiled roofs, walls and the harbour full of ships. Camera: high aerial, the torch in the foreground. In bright daylight: the torch flame bright orange, red-tiled roofs and white walls, a pale turquoise sea. Dominant colours: pale sky blue and turquoise, terracotta, the bronze figure. The Wonder's defining shape reads clearly in the upper two-thirds; the lower third stays painted but calmer, and the top-left corner is quiet. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

---

<a id="batch-02"></a>

## Batch 02 · Wonders by night (7)

**Setup block** — paste first:

```text
Painterly digital illustration in the manner of the 7 Wonders second-edition card art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; the monumental ancient world of Egypt, Mesopotamia, Persia, Greece and Rome shown as living, prosperous places; cinematic depth, heroic in scale, never gory. No modern elements, no text, no lettering, no numbers, no signature, no watermark. This batch is the Night side of the seven Wonder boards: each is the same composition as its Day board — the same camera, the same layout — now at night, lit by moon, stars, lamps and fire (Alexandria in a lightning storm). Each board is its own painting and the seven must NOT look uniform: every Wonder has its own camera (aerial, straight down, eye-level, interior, from the water) and its own dominant colours, all named in its prompt — follow them exactly and never drift back to a generic eye-level view. The only thing the set shares is the format: a wide board panorama whose lower third will later sit under a row of stage plaques and whose top-left corner will carry the Wonder's emblem, so the Wonder's defining shape reads clearly in the upper two-thirds and the lower third stays painted but calmer. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`wonder-giza-night.png`** — 21:9 panorama, opaque

```text
The Pyramids of Giza seen from far across the open desert: the three pyramids on the horizon in the centre-right, the Sphinx's head rising from the sand at the far left, a camel caravan along a dune crest on the right. Camera: eye-level, very wide, distant. At night: a vast starry sky with the Milky Way arching over the pyramids, a low full moon turning their casing pale silver, the caravan lit by a few torches. Dominant colours: deep indigo and silver-blue, with small orange torchlight. The Wonder's defining shape reads clearly in the upper two-thirds; the lower third stays painted but calmer, and the top-left corner is quiet. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`wonder-ephesos-night.png`** — 21:9 panorama, opaque

```text
The Temple of Artemis at Ephesos seen from high above at a three-quarter aerial angle: the whole vast Ionic temple on its stepped marble platform, a double forest of white columns, a painted pediment, wide stairs with a procession, cypress and olive groves and the river plain around it. On the night of Artemis's festival: a thin crescent moon high above, the temple lit from within by hundreds of lamps so the columns glow, the procession a winding line of torches, the groves dark. Dominant colours: cool slate blue and moonlit silver, with rose-gold lamplight. The Wonder's defining shape reads clearly in the upper two-thirds; the lower third stays painted but calmer, and the top-left corner is quiet. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`wonder-olympia-night.png`** — 21:9 panorama, opaque

```text
Inside the Temple of Zeus at Olympia: the colossal seated Zeus of gold and ivory towering at the end of the hall on the right, a winged Victory in his palm and an eagle on his sceptre, rows of giant columns receding on both sides, a reflecting pool on the floor, tiny pilgrims at his feet for scale. Camera: interior, low angle looking up along the nave. By night: the hall dark, the statue lit from below by rows of oil lamps and two great braziers, cool blue moonlight falling through the doorway behind the viewer, the gold glinting out of deep shadow. Dominant colours: deep bronze-black and moon blue, with warm lamp gold. The Wonder's defining shape reads clearly in the upper two-thirds; the lower third stays painted but calmer, and the top-left corner is quiet. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`wonder-babylon-night.png`** — 21:9 panorama, opaque

```text
The Hanging Gardens of Babylon seen almost straight down from a bird's-eye view: a round tiered garden-tower left of centre ringed by stepped terraces, a grid of red-brick walls, courtyards, canals and pools around it, every terrace dense with palms and vines. Camera: high aerial looking almost straight down, like a map. At night: hundreds of lamps glowing along the walkways and terrace edges, the gardens deep black-green, the moon reflected in the pools and canals. Dominant colours: dark emerald and night blue, with warm lamp-gold lines tracing the walls. The Wonder's defining shape reads clearly in the upper two-thirds; the lower third stays painted but calmer, and the top-left corner is quiet. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`wonder-alexandria-night.png`** — 21:9 panorama, opaque

```text
The Lighthouse of Alexandria seen from the open sea: the white three-tiered Pharos on its rocky island left of centre, waves breaking on the rocks, a merchant ship in the foreground right. Camera: low, from the waves. At night in a violent storm: forks of lightning splitting a churning sky, huge green waves, the beacon fire blazing at the top, the ship with a torn sail heeling over. Dominant colours: storm teal and bottle green, black-green sky, white lightning and the orange beacon. The Wonder's defining shape reads clearly in the upper two-thirds; the lower third stays painted but calmer, and the top-left corner is quiet. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`wonder-halikarnassos-night.png`** — 21:9 panorama, opaque

```text
The Mausoleum of Halikarnassos seen from across the bay: the tall tomb on its high podium at the left, Ionic columns with statues, a stepped roof with a marble four-horse chariot at the peak, cypresses and the harbour town along the shore, the calm bay in front. Camera: eye-level from across the water, wide. On a still moonlit night: a large crescent moon high on the right, moonlight laid across the dark bay, the roof and chariot outlined in silver, fire bowls burning along the podium, the town asleep. Dominant colours: deep midnight blue and indigo, silver moonlight, small warm fire accents. The Wonder's defining shape reads clearly in the upper two-thirds; the lower third stays painted but calmer, and the top-left corner is quiet. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`wonder-rhodes-night.png`** — 21:9 panorama, opaque

```text
The Colossus of Rhodes in a dramatic close aerial view: the bronze Helios looming huge over the right third of the frame, only his crowned head, shoulder and the arm raising a torch toward the viewer in view; far below him the whole city of Rhodes spreads to the left, a dense maze of tiled roofs, walls and the harbour full of ships. Camera: high aerial, the torch in the foreground. At night: the torch blazing and lighting the statue's face and arm, the city below a carpet of warm window lights and harbour lanterns reflected in the black water, stars above. Dominant colours: navy and black-blue, with the fiery torch and amber city lights. The Wonder's defining shape reads clearly in the upper two-thirds; the lower third stays painted but calmer, and the top-left corner is quiet. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

---

<a id="batch-03"></a>

## Batch 03 · Wonder crests and the game emblem (8)

**Setup block** — paste first:

```text
Painterly digital illustration in the manner of the 7 Wonders second-edition card art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; warm golden Mediterranean light against deep cool shadows; a rich palette of terracotta, ochre, sand, lapis blue, verdigris green and marble white, with the colour this prompt names leading the picture; the monumental ancient world of Egypt, Mesopotamia, Persia, Greece and Rome shown as living, prosperous, busy places; cinematic depth with a light haze and drifting dust in the air; heroic in scale, warm and inviting, never grim and never gory. No modern elements, no text, no lettering, no numbers, no signature, no watermark. This batch is round crests: one per Wonder, plus the game's own emblem — the badges that stand for each city wherever the board names it, so they must read at 40 px. One coherent set: every crest the same round medallion with a thick polished gold rim carrying a fine Greek-key pattern, the subject painted inside on a field of the crest's colour, the same soft light from the upper left, the same level of detail. Each crest's colour, named in its prompt, fills its field. A round medallion centred and filling about 92% of the canvas, perfectly circular. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`crest-giza.png`** — 1:1 square, transparent

```text
The crest of The Pyramids of Giza: the three pyramids of Giza seen from the side, the tallest in the centre with a gilded tip, a sliver of the Nile below, on a field of warm desert gold (#c99a52). A round medallion: a thick polished gold rim with a fine Greek-key pattern, inside it the subject painted on a field of the named colour, softly lit from the upper left. The medallion centred and filling about 92% of the canvas, perfectly circular. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`crest-babylon.png`** — 1:1 square, transparent

```text
The crest of The Hanging Gardens of Babylon: the stepped Hanging Gardens, each terrace spilling green palms and vines, on a field of lush garden green (#3f8a5e). A round medallion: a thick polished gold rim with a fine Greek-key pattern, inside it the subject painted on a field of the named colour, softly lit from the upper left. The medallion centred and filling about 92% of the canvas, perfectly circular. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`crest-olympia.png`** — 1:1 square, transparent

```text
The crest of The Statue of Zeus in Olympia: the head and shoulders of the gold-and-ivory statue of Zeus in profile, a laurel crown in his hair, on a field of storm slate blue (#7484ad). A round medallion: a thick polished gold rim with a fine Greek-key pattern, inside it the subject painted on a field of the named colour, softly lit from the upper left. The medallion centred and filling about 92% of the canvas, perfectly circular. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`crest-rhodes.png`** — 1:1 square, transparent

```text
The crest of The Colossus of Rhodes: the bronze Colossus of Rhodes from the waist up, his radiant sun crown and his raised torch, on a field of bronze and sea blue (#b9813f with #1d3550). A round medallion: a thick polished gold rim with a fine Greek-key pattern, inside it the subject painted on a field of the named colour, softly lit from the upper left. The medallion centred and filling about 92% of the canvas, perfectly circular. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`crest-ephesos.png`** — 1:1 square, transparent

```text
The crest of The Temple of Artemis in Ephesos: the front of the Temple of Artemis, a row of white Ionic columns under a pediment, on a field of dusky rose marble (#b0807a). A round medallion: a thick polished gold rim with a fine Greek-key pattern, inside it the subject painted on a field of the named colour, softly lit from the upper left. The medallion centred and filling about 92% of the canvas, perfectly circular. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`crest-alexandria.png`** — 1:1 square, transparent

```text
The crest of The Lighthouse of Alexandria: the three-tiered Pharos lighthouse with its beacon fire burning at the top, on a field of deep Mediterranean blue (#2f78aa). A round medallion: a thick polished gold rim with a fine Greek-key pattern, inside it the subject painted on a field of the named colour, softly lit from the upper left. The medallion centred and filling about 92% of the canvas, perfectly circular. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`crest-halikarnassos.png`** — 1:1 square, transparent

```text
The crest of The Mausoleum of Halikarnassos: the Mausoleum's stepped pyramid roof crowned by the marble four-horse chariot, on a field of royal violet (#7d5c9c). A round medallion: a thick polished gold rim with a fine Greek-key pattern, inside it the subject painted on a field of the named colour, softly lit from the upper left. The medallion centred and filling about 92% of the canvas, perfectly circular. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`emblem-seven-wonders.png`** — 1:1 square, transparent

```text
The game's emblem: seven slender white marble columns standing in an arc, each column a different height like a skyline, inside a ring of golden laurel leaves, on a field of deep lapis blue (#1f3a68) with a few gold stars. A round medallion: a thick polished gold rim with a fine Greek-key pattern, inside it the subject painted on the lapis field, softly lit from the upper left. The medallion centred and filling about 92% of the canvas, perfectly circular. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-04"></a>

## Batch 04 · Age card backs (3)

**Setup block** — paste first (this batch replaces the painterly base directive with its own, because the printed backs are flat graphic design):

```text
A flat, printed card-back design in the style of the 7 Wonders second-edition Age card backs: clean graphic print, not a painting, no scene, no texture beyond a fine print grain. Every back has the same layout: a solid metallic-coloured outer border about 6% of the card width, inside it a near-black warm espresso-brown field (#2a1f1a), framed by a thin single line in the border's colour inset a little from the field's edge, whose top and bottom edges curve inward in a shallow concave arc with small notched corners, like an antique label. In the exact centre a round medallion in the border's colour: a thin outer ring, a band of Greek-key meander pattern, a thin inner ring, and inside it a tall, slender, classical serif Roman numeral in the same colour, standing upright and centred. Only two colours on each back: the Age's metal and the dark field. Perfectly symmetrical, flat front view, crisp clean edges. No arrows or other symbols. An opaque image filling the whole canvas, no other text, no lettering, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`back-age-1.png`** — 2:3 portrait, opaque

```text
The back of the Age I cards. The metal colour is burnt copper orange (#d0643a): the outer border, the inset line, the medallion with its Greek-key band and the numeral are all this colour on the near-black espresso-brown field (#2a1f1a). The numeral is the Roman numeral I — one single tall slender serif stroke sharing a top and bottom serif bar — centred in the medallion. The inset line's top and bottom edges curve inward with small notched corners, like an antique label. Flat, clean graphic print, perfectly symmetrical, nothing else on the card. No arrows or other symbols. An opaque image filling the whole canvas, no other text, no lettering, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`back-age-2.png`** — 2:3 portrait, opaque

```text
The back of the Age II cards. The metal colour is pale rose-champagne, like rose gold (#d2ad9c): the outer border, the inset line, the medallion with its Greek-key band and the numeral are all this colour on the near-black espresso-brown field (#2a1f1a). The numeral is the Roman numeral II — two tall slender serif strokes sharing a top and bottom serif bar — centred in the medallion. The inset line's top and bottom edges curve inward with small notched corners, like an antique label. Flat, clean graphic print, perfectly symmetrical, nothing else on the card. No arrows or other symbols. An opaque image filling the whole canvas, no other text, no lettering, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`back-age-3.png`** — 2:3 portrait, opaque

```text
The back of the Age III cards. The metal colour is warm gold yellow (#e6a630): the outer border, the inset line, the medallion with its Greek-key band and the numeral are all this colour on the near-black espresso-brown field (#2a1f1a). The numeral is the Roman numeral III — three tall slender serif strokes sharing a top and bottom serif bar — centred in the medallion. The inset line's top and bottom edges curve inward with small notched corners, like an antique label. Flat, clean graphic print, perfectly symmetrical, nothing else on the card. No arrows or other symbols. An opaque image filling the whole canvas, no other text, no lettering, no watermark. Portrait composition, 2:3 aspect ratio.
```

---

<a id="batch-05"></a>

## Batch 05 · Tokens (9)

**Setup block** — paste first:

```text
Painterly digital illustration in the manner of the 7 Wonders second-edition card art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; warm golden Mediterranean light against deep cool shadows; a rich palette of terracotta, ochre, sand, lapis blue, verdigris green and marble white, with the colour this prompt names leading the picture; the monumental ancient world of Egypt, Mesopotamia, Persia, Greece and Rome shown as living, prosperous, busy places; cinematic depth with a light haze and drifting dust in the air; heroic in scale, warm and inviting, never grim and never gory. No modern elements, no text, no lettering, no numbers, no signature, no watermark. This batch is the small physical pieces of the game — conflict tokens, coins and Edifice pieces — as polished, slightly worn metal, stone and wood objects seen straight on, so they read as real pieces at 24 px. One coherent set: the same straight-on view, the same warm light from the upper left, the same crisp outline. Where a token carries a value, its face is left blank: the game prints the number. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`token-victory-1.png`** — 1:1 square, transparent

```text
A round military victory token of warm bronze (#b07a3a): a laurel wreath embossed around a blank, smooth centre. A physical game token seen straight on, centred and filling about 88% of the canvas, with a crisp outline, a raised rim and a single warm highlight from the upper left. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`token-victory-3.png`** — 1:1 square, transparent

```text
A round military victory token of bright silver (#c8ccd2): a laurel wreath embossed around a blank, smooth centre, a little larger and more ornate than the bronze one. A physical game token seen straight on, centred and filling about 88% of the canvas, with a crisp outline, a raised rim and a single warm highlight from the upper left. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`token-victory-5.png`** — 1:1 square, transparent

```text
A round military victory token of rich gold (#e2b23c): a full laurel wreath with berries embossed around a blank, smooth centre, the most ornate of the three. A physical game token seen straight on, centred and filling about 88% of the canvas, with a crisp outline, a raised rim and a single warm highlight from the upper left. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`token-defeat.png`** — 1:1 square, transparent

```text
A round military defeat token of dark iron (#3a3a40): a broken sword embossed across it and a crack running through the metal, a blank patch in the centre, dull and battered. A physical game token seen straight on, centred and filling about 88% of the canvas, with a crisp outline, a raised rim and a single warm highlight from the upper left. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`coin-1.png`** — 1:1 square, transparent

```text
An ancient silver drachma coin (#c0c4c9): hand-struck and slightly irregular, an owl in relief on its face, worn edges. A physical game token seen straight on, centred and filling about 88% of the canvas, with a crisp outline, a raised rim and a single warm highlight from the upper left. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`coin-3.png`** — 1:1 square, transparent

```text
An ancient gold coin (#e2b23c), larger and thicker than a drachma: hand-struck, a laurel-crowned head in profile in relief, worn edges. A physical game token seen straight on, centred and filling about 88% of the canvas, with a crisp outline, a raised rim and a single warm highlight from the upper left. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`token-edifice-pawn.png`** — 1:1 square, transparent

```text
A small wooden participation pawn shaped like a stylised builder — a round head on a tapered body — carved from honey-coloured olive wood (#c79a5b), standing upright, seen straight on. A physical game token seen straight on, centred and filling about 88% of the canvas, with a crisp outline, a raised rim and a single warm highlight from the upper left. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`token-edifice-victory.png`** — 1:1 square, transparent

```text
A square bronze victory plaque (#b07a3a) with rounded corners, a small temple pediment embossed at the top and a blank, smooth centre for the value. A physical game token seen straight on, centred and filling about 88% of the canvas, with a crisp outline, a raised rim and a single warm highlight from the upper left. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`token-debt.png`** — 1:1 square, transparent

```text
A square grey stone debt tablet (#6b6b70) with rounded corners, a crude chain carved along its edge and a blank, smooth centre for the value, chipped and weathered. A physical game token seen straight on, centred and filling about 88% of the canvas, with a crisp outline, a raised rim and a single warm highlight from the upper left. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-06"></a>

## Batch 06 · Icons I — resources and science (10)

**Setup block** — paste first:

```text
Painterly digital illustration in the manner of the 7 Wonders second-edition card art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; warm golden Mediterranean light against deep cool shadows; a rich palette of terracotta, ochre, sand, lapis blue, verdigris green and marble white, with the colour this prompt names leading the picture; the monumental ancient world of Egypt, Mesopotamia, Persia, Greece and Rome shown as living, prosperous, busy places; cinematic depth with a light haze and drifting dust in the air; heroic in scale, warm and inviting, never grim and never gory. No modern elements, no text, no lettering, no numbers, no signature, no watermark. This batch is the resource and science icons, matching the round icons printed on the cards so the board and the cards speak one language: raw materials as a small glossy object on a round enamel disc, manufactured goods on an octagonal enamel plaque, each with a thin polished gold rim; science symbols as the object alone. One set with one light direction (upper left), one level of detail and one size, readable at 20 px. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-wood.png`** — 1:1 square, transparent

```text
Wood: a small stack of three cut logs, on leaf green (#4f8a2c). A game icon matching the round icons printed on the cards: the object painted small and glossy on a round enamel disc of the named colour, a thin polished gold rim, a soft highlight from the upper left, readable at 20 px. The disc centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-stone.png`** — 1:1 square, transparent

```text
Stone: a squared grey quarry block with chisel marks, on slate grey (#8a94a0). A game icon matching the round icons printed on the cards: the object painted small and glossy on a round enamel disc of the named colour, a thin polished gold rim, a soft highlight from the upper left, readable at 20 px. The disc centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-clay.png`** — 1:1 square, transparent

```text
Clay: two stacked red-orange bricks, on terracotta red (#c9572b). A game icon matching the round icons printed on the cards: the object painted small and glossy on a round enamel disc of the named colour, a thin polished gold rim, a soft highlight from the upper left, readable at 20 px. The disc centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-ore.png`** — 1:1 square, transparent

```text
Ore: a dark rough ore nugget with glinting metal flecks, on charcoal (#3d3d44). A game icon matching the round icons printed on the cards: the object painted small and glossy on a round enamel disc of the named colour, a thin polished gold rim, a soft highlight from the upper left, readable at 20 px. The disc centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-glass.png`** — 1:1 square, transparent

```text
Glass: a small clear blue glass vase, on sky blue (#2f8fc4). A game icon matching the round icons printed on the cards: the object painted small and glossy on an octagonal enamel plaque of the named colour, a thin polished gold rim, a soft highlight from the upper left, readable at 20 px. The plaque centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-loom.png`** — 1:1 square, transparent

```text
Cloth: a folded bolt of pink-purple woven cloth, on magenta (#a8358c). A game icon matching the round icons printed on the cards: the object painted small and glossy on an octagonal enamel plaque of the named colour, a thin polished gold rim, a soft highlight from the upper left, readable at 20 px. The plaque centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-papyrus.png`** — 1:1 square, transparent

```text
Papyrus: a partly unrolled papyrus scroll, on tan (#b98e4f). A game icon matching the round icons printed on the cards: the object painted small and glossy on an octagonal enamel plaque of the named colour, a thin polished gold rim, a soft highlight from the upper left, readable at 20 px. The plaque centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-gear.png`** — 1:1 square, transparent

```text
The gear science symbol: a bronze cogwheel (#9c5a2e) with eight square teeth and a round hub. A game icon matching the science symbols printed on the green cards: the object alone, painted glossy and solid with no disc behind it, a soft highlight from the upper left, readable at 20 px. The object centred and filling about 85% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-compass.png`** — 1:1 square, transparent

```text
The compass science symbol: a gold draftsman's compass (#d9a520) standing open over a set square. A game icon matching the science symbols printed on the green cards: the object alone, painted glossy and solid with no disc behind it, a soft highlight from the upper left, readable at 20 px. The object centred and filling about 85% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-tablet.png`** — 1:1 square, transparent

```text
The tablet science symbol: a terracotta clay tablet (#b5603a) with rounded corners and rows of pressed wedge-shaped marks. A game icon matching the science symbols printed on the green cards: the object alone, painted glossy and solid with no disc behind it, a soft highlight from the upper left, readable at 20 px. The object centred and filling about 85% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-07"></a>

## Batch 07 · Icons II — game symbols (10)

**Setup block** — paste first:

```text
Painterly digital illustration in the manner of the 7 Wonders second-edition card art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; warm golden Mediterranean light against deep cool shadows; a rich palette of terracotta, ochre, sand, lapis blue, verdigris green and marble white, with the colour this prompt names leading the picture; the monumental ancient world of Egypt, Mesopotamia, Persia, Greece and Rome shown as living, prosperous, busy places; cinematic depth with a light haze and drifting dust in the air; heroic in scale, warm and inviting, never grim and never gory. No modern elements, no text, no lettering, no numbers, no signature, no watermark. This batch is the game's other symbols — military strength, points, coins, chains, selling, building — in the same painted, glossy style as the card icons, so they sit beside the resource icons as one family: small solid objects with a thin polished gold edge, one light direction (upper left), one level of detail, readable at 20 px. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-shield.png`** — 1:1 square, transparent

```text
Military strength: two crossed short swords over a round red shield (#c9302c) with a gold rim, as on the red cards. A game icon in the same painted, glossy style as the card icons: the object small and solid, a thin polished gold edge where it has one, a soft highlight from the upper left, readable at 20 px. The icon centred and filling about 85% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-laurel.png`** — 1:1 square, transparent

```text
Victory points: a closed ring of green laurel leaves (#3f8a3a) with a white enamel centre left blank for a number. A game icon in the same painted, glossy style as the card icons: the object small and solid, a thin polished gold edge where it has one, a soft highlight from the upper left, readable at 20 px. The icon centred and filling about 85% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-coin.png`** — 1:1 square, transparent

```text
A coin: a single round gold coin (#e2b23c) with a raised rim and a blank face, seen straight on. A game icon in the same painted, glossy style as the card icons: the object small and solid, a thin polished gold edge where it has one, a soft highlight from the upper left, readable at 20 px. The icon centred and filling about 85% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-chain.png`** — 1:1 square, transparent

```text
A free build by chain: two interlocked golden chain links (#d9a520) on a diagonal. A game icon in the same painted, glossy style as the card icons: the object small and solid, a thin polished gold edge where it has one, a soft highlight from the upper left, readable at 20 px. The icon centred and filling about 85% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-sell.png`** — 1:1 square, transparent

```text
Selling a card: a face-down card tipping over with three gold coins spilling from it. A game icon in the same painted, glossy style as the card icons: the object small and solid, a thin polished gold edge where it has one, a soft highlight from the upper left, readable at 20 px. The icon centred and filling about 85% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-wonder-stage.png`** — 1:1 square, transparent

```text
A wonder stage: a small golden stepped pyramid (#d9a520) with three steps, as on the yellow and purple cards. A game icon in the same painted, glossy style as the card icons: the object small and solid, a thin polished gold edge where it has one, a soft highlight from the upper left, readable at 20 px. The icon centred and filling about 85% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-trade.png`** — 1:1 square, transparent

```text
Trading with a neighbour: a small bronze balance scale (#b07a3a) with a coin in one pan and a brick in the other. A game icon in the same painted, glossy style as the card icons: the object small and solid, a thin polished gold edge where it has one, a soft highlight from the upper left, readable at 20 px. The icon centred and filling about 85% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-science-any.png`** — 1:1 square, transparent

```text
Any science symbol: a bronze cogwheel, a gold compass and a clay tablet fanned together, overlapping. A game icon in the same painted, glossy style as the card icons: the object small and solid, a thin polished gold edge where it has one, a soft highlight from the upper left, readable at 20 px. The icon centred and filling about 85% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-hand.png`** — 1:1 square, transparent

```text
A hand of cards: three card backs fanned out, the front one lapis blue (#24477a) with a gold border. A game icon in the same painted, glossy style as the card icons: the object small and solid, a thin polished gold edge where it has one, a soft highlight from the upper left, readable at 20 px. The icon centred and filling about 85% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-edifice.png`** — 1:1 square, transparent

```text
An Edifice project: a small half-built temple front of white marble wrapped in wooden scaffolding with a little crane. A game icon in the same painted, glossy style as the card icons: the object small and solid, a thin polished gold edge where it has one, a soft highlight from the upper left, readable at 20 px. The icon centred and filling about 85% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-08"></a>

## Batch 08 · Icons III — the score pad (8)

**Setup block** — paste first:

```text
Painterly digital illustration in the manner of the 7 Wonders second-edition card art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; warm golden Mediterranean light against deep cool shadows; a rich palette of terracotta, ochre, sand, lapis blue, verdigris green and marble white, with the colour this prompt names leading the picture; the monumental ancient world of Egypt, Mesopotamia, Persia, Greece and Rome shown as living, prosperous, busy places; cinematic depth with a light haze and drifting dust in the air; heroic in scale, warm and inviting, never grim and never gory. No modern elements, no text, no lettering, no numbers, no signature, no watermark. This batch is the eight categories of the score pad, used in the live score, the score bar and the results screen: each a small emblem inside a rounded square plaque of its category colour with a thin polished gold rim. One coherent set, one light direction (upper left), one level of detail, readable at 20 px. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`score-military.png`** — 1:1 square, transparent

```text
Military: a bronze laurel victory token beside a cracked iron defeat token, on regimental red (#dc4b4b). A score-pad emblem: the subject painted small inside a rounded square plaque of the named colour with a thin polished gold rim, a soft highlight from the upper left, readable at 20 px. The plaque centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`score-treasury.png`** — 1:1 square, transparent

```text
Treasury: a small stack of gold and silver coins, on gold (#d9a520). A score-pad emblem: the subject painted small inside a rounded square plaque of the named colour with a thin polished gold rim, a soft highlight from the upper left, readable at 20 px. The plaque centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`score-wonder.png`** — 1:1 square, transparent

```text
Wonder: a golden stepped pyramid, on warm sand (#c99a52). A score-pad emblem: the subject painted small inside a rounded square plaque of the named colour with a thin polished gold rim, a soft highlight from the upper left, readable at 20 px. The plaque centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`score-civilian.png`** — 1:1 square, transparent

```text
Civilian: a white marble temple front with four columns, on civic blue (#3b82f6). A score-pad emblem: the subject painted small inside a rounded square plaque of the named colour with a thin polished gold rim, a soft highlight from the upper left, readable at 20 px. The plaque centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`score-commercial.png`** — 1:1 square, transparent

```text
Commercial: a striped market-stall awning over a crate of goods, on saffron yellow (#e8b730). A score-pad emblem: the subject painted small inside a rounded square plaque of the named colour with a thin polished gold rim, a soft highlight from the upper left, readable at 20 px. The plaque centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`score-guilds.png`** — 1:1 square, transparent

```text
Guilds: a hanging guild banner with a small golden tool emblem, on royal purple (#9d5bc0). A score-pad emblem: the subject painted small inside a rounded square plaque of the named colour with a thin polished gold rim, a soft highlight from the upper left, readable at 20 px. The plaque centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`score-science.png`** — 1:1 square, transparent

```text
Science: a cogwheel, a compass and a clay tablet together, on emerald green (#3fa860). A score-pad emblem: the subject painted small inside a rounded square plaque of the named colour with a thin polished gold rim, a soft highlight from the upper left, readable at 20 px. The plaque centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`score-edifice.png`** — 1:1 square, transparent

```text
Edifice: a half-built temple in scaffolding, on teal (#2bb3a3). A score-pad emblem: the subject painted small inside a rounded square plaque of the named colour with a thin polished gold rim, a soft highlight from the upper left, readable at 20 px. The plaque centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-09"></a>

## Batch 09 · Edifice blueprints I — Ages I and II (10)

**Setup block** — paste first:

```text
This batch is the Edifice projects as their architect's plans, shown before they are built, in the manner of the 7 Wonders Edifice blueprints: a hand-drawn architectural front elevation on aged parchment. One coherent set: warm beige parchment with soft mottled stains and faint brush texture filling the whole canvas; the building drawn as a flat front elevation in confident dark sepia-brown ink line work with a light sepia wash for shading and stone joints; thin blue-ink dimension lines with small arrowheads and tick marks running up one side and along the base, beside short scribbled annotations in blue ink that look like an ancient script and read as no real letters; one or two tiny sketched human figures at the base for scale; a single ground line across the sheet. The building stands in the lower two-thirds, centred; the top third is empty parchment. Not a painting, not a photograph: a drawn plan. No colour except the parchment, the sepia ink and the blue dimension ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

**`edifice-artisan-district-blueprint.png`** — 2:3 portrait, opaque

```text
The architect's plan for the Edifice project Artisan District: a two-storey row of three workshops of sandstone and timber under one long tiled roof, each with a wide arched opening on the ground floor and a wooden balcony above, a small domed kiln chimney rising at one end, stone steps in front. Drawn as a flat front elevation in dark sepia-brown ink with a light sepia wash on warm, stained beige parchment; thin blue-ink dimension lines with arrowheads up one side and along the base, short blue scribbled annotations that read as no real letters, a tiny sketched figure at the base for scale, a single ground line. The building in the lower two-thirds, centred; the top third empty parchment. No colour but parchment, sepia and blue ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

**`edifice-belvedere-blueprint.png`** — 2:3 portrait, opaque

```text
The architect's plan for the Edifice project Belvedere: a round open pavilion of eight slender columns under a ribbed dome topped by a small finial, standing on a tall square stone tower with a balustraded terrace and an arched doorway at its foot. Drawn as a flat front elevation in dark sepia-brown ink with a light sepia wash on warm, stained beige parchment; thin blue-ink dimension lines with arrowheads up one side and along the base, short blue scribbled annotations that read as no real letters, a tiny sketched figure at the base for scale, a single ground line. The building in the lower two-thirds, centred; the top third empty parchment. No colour but parchment, sepia and blue ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

**`edifice-curtain-wall-blueprint.png`** — 2:3 portrait, opaque

```text
The architect's plan for the Edifice project Curtain Wall: a straight stretch of crenellated city wall between two square towers, with an arched gatehouse in the middle under a covered wall-walk, arrow slits along the towers. Drawn as a flat front elevation in dark sepia-brown ink with a light sepia wash on warm, stained beige parchment; thin blue-ink dimension lines with arrowheads up one side and along the base, short blue scribbled annotations that read as no real letters, a tiny sketched figure at the base for scale, a single ground line. The building in the lower two-thirds, centred; the top third empty parchment. No colour but parchment, sepia and blue ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

**`edifice-money-changer-blueprint.png`** — 2:3 portrait, opaque

```text
The architect's plan for the Edifice project Money Changer: a small colonnaded hall of four Doric columns under a low triangular pediment, a stone counter between the columns, a heavy bronze-bound door behind it and a round coin emblem in the pediment. Drawn as a flat front elevation in dark sepia-brown ink with a light sepia wash on warm, stained beige parchment; thin blue-ink dimension lines with arrowheads up one side and along the base, short blue scribbled annotations that read as no real letters, a tiny sketched figure at the base for scale, a single ground line. The building in the lower two-thirds, centred; the top third empty parchment. No colour but parchment, sepia and blue ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

**`edifice-outpost-blueprint.png`** — 2:3 portrait, opaque

```text
The architect's plan for the Edifice project Outpost: a compact square stone fort on a rocky outcrop: a tall watchtower with a brazier platform on top, a short crenellated wall with a single gate, a wooden ladder up the tower's side. Drawn as a flat front elevation in dark sepia-brown ink with a light sepia wash on warm, stained beige parchment; thin blue-ink dimension lines with arrowheads up one side and along the base, short blue scribbled annotations that read as no real letters, a tiny sketched figure at the base for scale, a single ground line. The building in the lower two-thirds, centred; the top third empty parchment. No colour but parchment, sepia and blue ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

**`edifice-factory-blueprint.png`** — 2:3 portrait, opaque

```text
The architect's plan for the Edifice project Factory: a long brick manufactory hall with a row of tall arched windows, three tall round chimneys rising from its roof and a large round kiln dome built against one end. Drawn as a flat front elevation in dark sepia-brown ink with a light sepia wash on warm, stained beige parchment; thin blue-ink dimension lines with arrowheads up one side and along the base, short blue scribbled annotations that read as no real letters, a tiny sketched figure at the base for scale, a single ground line. The building in the lower two-thirds, centred; the top third empty parchment. No colour but parchment, sepia and blue ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

**`edifice-amphitheater-blueprint.png`** — 2:3 portrait, opaque

```text
The architect's plan for the Edifice project Amphitheater: a Greek theatre: a semicircle of tiered stone seats rising in a bowl, a round stage floor at its foot and a two-storey columned stage building closing the front. Drawn as a flat front elevation in dark sepia-brown ink with a light sepia wash on warm, stained beige parchment; thin blue-ink dimension lines with arrowheads up one side and along the base, short blue scribbled annotations that read as no real letters, a tiny sketched figure at the base for scale, a single ground line. The building in the lower two-thirds, centred; the top third empty parchment. No colour but parchment, sepia and blue ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

**`edifice-auction-house-blueprint.png`** — 2:3 portrait, opaque

```text
The architect's plan for the Edifice project Auction House: a grand covered market hall with a high gabled roof on rows of columns, open on the front, a raised speaker's podium in the middle and a clerestory of small windows under the roof. Drawn as a flat front elevation in dark sepia-brown ink with a light sepia wash on warm, stained beige parchment; thin blue-ink dimension lines with arrowheads up one side and along the base, short blue scribbled annotations that read as no real letters, a tiny sketched figure at the base for scale, a single ground line. The building in the lower two-thirds, centred; the top third empty parchment. No colour but parchment, sepia and blue ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

**`edifice-staging-camp-blueprint.png`** — 2:3 portrait, opaque

```text
The architect's plan for the Edifice project Staging Camp: a square military camp behind a sharpened timber palisade with a wooden gate tower, rows of peaked tents inside, a tall standard pole with a banner and a raised wooden command platform. Drawn as a flat front elevation in dark sepia-brown ink with a light sepia wash on warm, stained beige parchment; thin blue-ink dimension lines with arrowheads up one side and along the base, short blue scribbled annotations that read as no real letters, a tiny sketched figure at the base for scale, a single ground line. The building in the lower two-thirds, centred; the top third empty parchment. No colour but parchment, sepia and blue ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

**`edifice-river-port-blueprint.png`** — 2:3 portrait, opaque

```text
The architect's plan for the Edifice project River Port: a stone quay with two timber warehouses with loading cranes on their gables, a three-arched stone bridge beside them and a moored cargo barge. Drawn as a flat front elevation in dark sepia-brown ink with a light sepia wash on warm, stained beige parchment; thin blue-ink dimension lines with arrowheads up one side and along the base, short blue scribbled annotations that read as no real letters, a tiny sketched figure at the base for scale, a single ground line. The building in the lower two-thirds, centred; the top third empty parchment. No colour but parchment, sepia and blue ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

---

<a id="batch-10"></a>

## Batch 10 · Edifice blueprints II — Age III (5)

**Setup block** — paste first:

```text
This batch is the Edifice projects as their architect's plans, shown before they are built, in the manner of the 7 Wonders Edifice blueprints: a hand-drawn architectural front elevation on aged parchment. One coherent set: warm beige parchment with soft mottled stains and faint brush texture filling the whole canvas; the building drawn as a flat front elevation in confident dark sepia-brown ink line work with a light sepia wash for shading and stone joints; thin blue-ink dimension lines with small arrowheads and tick marks running up one side and along the base, beside short scribbled annotations in blue ink that look like an ancient script and read as no real letters; one or two tiny sketched human figures at the base for scale; a single ground line across the sheet. The building stands in the lower two-thirds, centred; the top third is empty parchment. Not a painting, not a photograph: a drawn plan. No colour except the parchment, the sepia ink and the blue dimension ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

**`edifice-gold-reserves-blueprint.png`** — 2:3 portrait, opaque

```text
The architect's plan for the Edifice project Gold Reserves: a solid square treasury of massive dressed stone with no windows, a pair of great bronze doors under a heavy lintel, a stepped roof and four squat corner towers. Drawn as a flat front elevation in dark sepia-brown ink with a light sepia wash on warm, stained beige parchment; thin blue-ink dimension lines with arrowheads up one side and along the base, short blue scribbled annotations that read as no real letters, a tiny sketched figure at the base for scale, a single ground line. The building in the lower two-thirds, centred; the top third empty parchment. No colour but parchment, sepia and blue ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

**`edifice-archives-blueprint.png`** — 2:3 portrait, opaque

```text
The architect's plan for the Edifice project Archives: a tall rectangular hall of stone with a colonnaded front of six Ionic columns, a wide stair, a pediment with a carved scroll, and high narrow windows along its side. Drawn as a flat front elevation in dark sepia-brown ink with a light sepia wash on warm, stained beige parchment; thin blue-ink dimension lines with arrowheads up one side and along the base, short blue scribbled annotations that read as no real letters, a tiny sketched figure at the base for scale, a single ground line. The building in the lower two-thirds, centred; the top third empty parchment. No colour but parchment, sepia and blue ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

**`edifice-concentric-castle-blueprint.png`** — 2:3 portrait, opaque

```text
The architect's plan for the Edifice project Concentric Castle: a hilltop fortress of two concentric rings of crenellated walls with round towers, the inner ring higher than the outer, a tall keep at the centre and a gate in each ring. Drawn as a flat front elevation in dark sepia-brown ink with a light sepia wash on warm, stained beige parchment; thin blue-ink dimension lines with arrowheads up one side and along the base, short blue scribbled annotations that read as no real letters, a tiny sketched figure at the base for scale, a single ground line. The building in the lower two-thirds, centred; the top third empty parchment. No colour but parchment, sepia and blue ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

**`edifice-agora-blueprint.png`** — 2:3 portrait, opaque

```text
The architect's plan for the Edifice project Agora: a broad square public plaza framed by long two-storey colonnaded stoas on three sides, a round fountain in the centre and a raised speaker's platform with steps. Drawn as a flat front elevation in dark sepia-brown ink with a light sepia wash on warm, stained beige parchment; thin blue-ink dimension lines with arrowheads up one side and along the base, short blue scribbled annotations that read as no real letters, a tiny sketched figure at the base for scale, a single ground line. The building in the lower two-thirds, centred; the top third empty parchment. No colour but parchment, sepia and blue ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

**`edifice-military-school-blueprint.png`** — 2:3 portrait, opaque

```text
The architect's plan for the Edifice project Military School: a columned gymnasium hall around a sand training court, a long portico on one side, an archery range with round straw targets and a weapons rack along the wall. Drawn as a flat front elevation in dark sepia-brown ink with a light sepia wash on warm, stained beige parchment; thin blue-ink dimension lines with arrowheads up one side and along the base, short blue scribbled annotations that read as no real letters, a tiny sketched figure at the base for scale, a single ground line. The building in the lower two-thirds, centred; the top third empty parchment. No colour but parchment, sepia and blue ink. No legible text, no lettering, no numbers, no title, no watermark. An opaque image filling the whole canvas edge to edge. Portrait composition, 2:3 aspect ratio.
```

---

<a id="batch-11"></a>

## Batch 11 · Edifice projects built I — Ages I and II (10)

**Setup block** — paste first:

```text
Painterly digital illustration in the manner of the 7 Wonders second-edition card art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; warm golden Mediterranean light against deep cool shadows; a rich palette of terracotta, ochre, sand, lapis blue, verdigris green and marble white, with the colour this prompt names leading the picture; the monumental ancient world of Egypt, Mesopotamia, Persia, Greece and Rome shown as living, prosperous, busy places; cinematic depth with a light haze and drifting dust in the air; heroic in scale, warm and inviting, never grim and never gory. No modern elements, no text, no lettering, no numbers, no signature, no watermark. This batch is the Edifice projects completed, in the manner of the 7 Wonders Edifice finished-project art: each is exactly the building shown in its architect's plan, now built and in use. One coherent set: the building seen from the front, only slightly turned and from a little below, so it matches the elevation of its plan; it stands in the lower two-thirds, centred, with its city and people around it at small scale; the top third is open sky, quiet and low in detail. Warm daylight, every building fresh and proud. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`edifice-artisan-district.png`** — 2:3 portrait, opaque

```text
The Edifice project Artisan District, completed: a two-storey row of three workshops of sandstone and timber under one long tiled roof, each with a wide arched opening on the ground floor and a wooden balcony above, a small domed kiln chimney rising at one end, stone steps in front. The finished building in fresh stone, painted plaster and bright roof tiles, alive with use — potters at their wheels, weavers and coppersmiths under striped awnings, smoke curling from the kiln. Seen from the front, only slightly turned and from a little below, so it matches its architect's plan. The building in the lower two-thirds, centred; the top third open sky, quiet and low in detail. Warm daylight. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`edifice-belvedere.png`** — 2:3 portrait, opaque

```text
The Edifice project Belvedere, completed: a round open pavilion of eight slender columns under a ribbed dome topped by a small finial, standing on a tall square stone tower with a balustraded terrace and an arched doorway at its foot. The finished building in fresh stone, painted plaster and bright roof tiles, alive with use — citizens on the terrace gazing out over the rooftops to a shining sea. Seen from the front, only slightly turned and from a little below, so it matches its architect's plan. The building in the lower two-thirds, centred; the top third open sky, quiet and low in detail. Warm daylight. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`edifice-curtain-wall.png`** — 2:3 portrait, opaque

```text
The Edifice project Curtain Wall, completed: a straight stretch of crenellated city wall between two square towers, with an arched gatehouse in the middle under a covered wall-walk, arrow slits along the towers. The finished building in fresh stone, painted plaster and bright roof tiles, alive with use — guards on the wall-walk with spears, a cart passing through the gate. Seen from the front, only slightly turned and from a little below, so it matches its architect's plan. The building in the lower two-thirds, centred; the top third open sky, quiet and low in detail. Warm daylight. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`edifice-money-changer.png`** — 2:3 portrait, opaque

```text
The Edifice project Money Changer, completed: a small colonnaded hall of four Doric columns under a low triangular pediment, a stone counter between the columns, a heavy bronze-bound door behind it and a round coin emblem in the pediment. The finished building in fresh stone, painted plaster and bright roof tiles, alive with use — the counter piled with coins of many cities and a set of scales, merchants haggling. Seen from the front, only slightly turned and from a little below, so it matches its architect's plan. The building in the lower two-thirds, centred; the top third open sky, quiet and low in detail. Warm daylight. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`edifice-outpost.png`** — 2:3 portrait, opaque

```text
The Edifice project Outpost, completed: a compact square stone fort on a rocky outcrop: a tall watchtower with a brazier platform on top, a short crenellated wall with a single gate, a wooden ladder up the tower's side. The finished building in fresh stone, painted plaster and bright roof tiles, alive with use — a signal fire burning on the tower, a sentry watching the wild hills beyond. Seen from the front, only slightly turned and from a little below, so it matches its architect's plan. The building in the lower two-thirds, centred; the top third open sky, quiet and low in detail. Warm daylight. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`edifice-factory.png`** — 2:3 portrait, opaque

```text
The Edifice project Factory, completed: a long brick manufactory hall with a row of tall arched windows, three tall round chimneys rising from its roof and a large round kiln dome built against one end. The finished building in fresh stone, painted plaster and bright roof tiles, alive with use — glow from the windows, smoke rising from the chimneys, workers carrying glass and cloth. Seen from the front, only slightly turned and from a little below, so it matches its architect's plan. The building in the lower two-thirds, centred; the top third open sky, quiet and low in detail. Warm daylight. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`edifice-amphitheater.png`** — 2:3 portrait, opaque

```text
The Edifice project Amphitheater, completed: a Greek theatre: a semicircle of tiered stone seats rising in a bowl, a round stage floor at its foot and a two-storey columned stage building closing the front. The finished building in fresh stone, painted plaster and bright roof tiles, alive with use — a crowd filling the seats, masked actors on the stage. Seen from the front, only slightly turned and from a little below, so it matches its architect's plan. The building in the lower two-thirds, centred; the top third open sky, quiet and low in detail. Warm daylight. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`edifice-auction-house.png`** — 2:3 portrait, opaque

```text
The Edifice project Auction House, completed: a grand covered market hall with a high gabled roof on rows of columns, open on the front, a raised speaker's podium in the middle and a clerestory of small windows under the roof. The finished building in fresh stone, painted plaster and bright roof tiles, alive with use — an auctioneer on the podium, merchants bidding over amphorae, bolts of cloth and statues. Seen from the front, only slightly turned and from a little below, so it matches its architect's plan. The building in the lower two-thirds, centred; the top third open sky, quiet and low in detail. Warm daylight. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`edifice-staging-camp.png`** — 2:3 portrait, opaque

```text
The Edifice project Staging Camp, completed: a square military camp behind a sharpened timber palisade with a wooden gate tower, rows of peaked tents inside, a tall standard pole with a banner and a raised wooden command platform. The finished building in fresh stone, painted plaster and bright roof tiles, alive with use — soldiers drilling between the tents, horses and chariots by the gate, the banner flying. Seen from the front, only slightly turned and from a little below, so it matches its architect's plan. The building in the lower two-thirds, centred; the top third open sky, quiet and low in detail. Warm daylight. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`edifice-river-port.png`** — 2:3 portrait, opaque

```text
The Edifice project River Port, completed: a stone quay with two timber warehouses with loading cranes on their gables, a three-arched stone bridge beside them and a moored cargo barge. The finished building in fresh stone, painted plaster and bright roof tiles, alive with use — barges unloading sacks and amphorae, the cranes hauling crates, boats under the bridge. Seen from the front, only slightly turned and from a little below, so it matches its architect's plan. The building in the lower two-thirds, centred; the top third open sky, quiet and low in detail. Warm daylight. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

---

<a id="batch-12"></a>

## Batch 12 · Edifice projects built II — Age III (5)

**Setup block** — paste first:

```text
Painterly digital illustration in the manner of the 7 Wonders second-edition card art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; warm golden Mediterranean light against deep cool shadows; a rich palette of terracotta, ochre, sand, lapis blue, verdigris green and marble white, with the colour this prompt names leading the picture; the monumental ancient world of Egypt, Mesopotamia, Persia, Greece and Rome shown as living, prosperous, busy places; cinematic depth with a light haze and drifting dust in the air; heroic in scale, warm and inviting, never grim and never gory. No modern elements, no text, no lettering, no numbers, no signature, no watermark. This batch is the Edifice projects completed, in the manner of the 7 Wonders Edifice finished-project art: each is exactly the building shown in its architect's plan, now built and in use. One coherent set: the building seen from the front, only slightly turned and from a little below, so it matches the elevation of its plan; it stands in the lower two-thirds, centred, with its city and people around it at small scale; the top third is open sky, quiet and low in detail. Warm daylight, every building fresh and proud. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`edifice-gold-reserves.png`** — 2:3 portrait, opaque

```text
The Edifice project Gold Reserves, completed: a solid square treasury of massive dressed stone with no windows, a pair of great bronze doors under a heavy lintel, a stepped roof and four squat corner towers. The finished building in fresh stone, painted plaster and bright roof tiles, alive with use — the bronze doors half open on chests of gold coin and stacked ingots, armoured guards at the door. Seen from the front, only slightly turned and from a little below, so it matches its architect's plan. The building in the lower two-thirds, centred; the top third open sky, quiet and low in detail. Warm daylight. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`edifice-archives.png`** — 2:3 portrait, opaque

```text
The Edifice project Archives, completed: a tall rectangular hall of stone with a colonnaded front of six Ionic columns, a wide stair, a pediment with a carved scroll, and high narrow windows along its side. The finished building in fresh stone, painted plaster and bright roof tiles, alive with use — scribes carrying scrolls and clay tablets up the stairs, shelves of scrolls glimpsed through the door. Seen from the front, only slightly turned and from a little below, so it matches its architect's plan. The building in the lower two-thirds, centred; the top third open sky, quiet and low in detail. Warm daylight. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`edifice-concentric-castle.png`** — 2:3 portrait, opaque

```text
The Edifice project Concentric Castle, completed: a hilltop fortress of two concentric rings of crenellated walls with round towers, the inner ring higher than the outer, a tall keep at the centre and a gate in each ring. The finished building in fresh stone, painted plaster and bright roof tiles, alive with use — banners on every tower, soldiers on the walls, the road winding up the hill to the outer gate. Seen from the front, only slightly turned and from a little below, so it matches its architect's plan. The building in the lower two-thirds, centred; the top third open sky, quiet and low in detail. Warm daylight. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`edifice-agora.png`** — 2:3 portrait, opaque

```text
The Edifice project Agora, completed: a broad square public plaza framed by long two-storey colonnaded stoas on three sides, a round fountain in the centre and a raised speaker's platform with steps. The finished building in fresh stone, painted plaster and bright roof tiles, alive with use — citizens debating, a speaker on the platform, the fountain sparkling. Seen from the front, only slightly turned and from a little below, so it matches its architect's plan. The building in the lower two-thirds, centred; the top third open sky, quiet and low in detail. Warm daylight. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`edifice-military-school.png`** — 2:3 portrait, opaque

```text
The Edifice project Military School, completed: a columned gymnasium hall around a sand training court, a long portico on one side, an archery range with round straw targets and a weapons rack along the wall. The finished building in fresh stone, painted plaster and bright roof tiles, alive with use — young soldiers drilling in formation, archers at the targets, sparring pairs in the sand. Seen from the front, only slightly turned and from a little below, so it matches its architect's plan. The building in the lower two-thirds, centred; the top third open sky, quiet and low in detail. Warm daylight. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

---

<a id="batch-13"></a>

## Batch 13 · Scenes and backgrounds (8)

**Setup block** — paste first:

```text
Painterly digital illustration in the manner of the 7 Wonders second-edition card art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; warm golden Mediterranean light against deep cool shadows; a rich palette of terracotta, ochre, sand, lapis blue, verdigris green and marble white, with the colour this prompt names leading the picture; the monumental ancient world of Egypt, Mesopotamia, Persia, Greece and Rome shown as living, prosperous, busy places; cinematic depth with a light haze and drifting dust in the air; heroic in scale, warm and inviting, never grim and never gory. No modern elements, no text, no lettering, no numbers, no signature, no watermark. This batch is the large backdrops the screens sit on: the table, the setup screen, the start of each Age, the war at each Age's end and the final triumph. They sit behind dark interface panels, so each keeps its middle calm and even, with no focal point under the centre where panels cover it, and its detail toward the edges. One coherent set with the same painterly finish and the same warm-light palette. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide composition, 16:9 aspect ratio.
```

**`bg-table.png`** — 16:9 wide, opaque

```text
The game table seen from above: a dark polished marble tabletop with faint gold veins, bronze inlay along the far edges, a few scattered laurel leaves and an oil lamp's warm glow at one corner. Very low contrast and dark overall, an even middle with no objects in it, detail only at the edges. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide composition, 16:9 aspect ratio.
```

**`bg-setup.png`** — 16:9 wide, opaque

```text
A fantastical panorama of the ancient world at golden hour in which all seven Wonders appear together at small scale across one great landscape — the pyramids on a desert plain, the green terraced Hanging Gardens, the Colossus over a harbour, the Pharos on its island, the Temple of Artemis and Temple of Zeus among hills, the Mausoleum on a coast — under a vast glowing sky. The sky in the upper middle calm and even. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide composition, 16:9 aspect ratio.
```

**`bg-age-1.png`** — 16:9 wide, opaque

```text
The dawn of Age I: a young city being founded at sunrise beside a river, the first mud-brick houses and a small shrine going up, quarrymen cutting stone and woodcutters felling trees, sandstone brown (#8a5a2b) light. The middle calm open sky. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide composition, 16:9 aspect ratio.
```

**`bg-age-2.png`** — 16:9 wide, opaque

```text
Age II at high noon: a thriving city of colonnades and markets, ships unloading in the harbour, caravans arriving through the gate, scholars on temple steps, lapis blue (#24477a) sky and sea. The middle calm open sky. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide composition, 16:9 aspect ratio.
```

**`bg-age-3.png`** — 16:9 wide, opaque

```text
Age III at sunset: a magnificent imperial city at the height of its glory, marble palaces and guild halls, a triumphal arch, banners and gilded statues catching the last light, imperial purple (#5b2e78) and gold sky. The middle calm open sky. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide composition, 16:9 aspect ratio.
```

**`bg-war.png`** — 16:9 wide, opaque

```text
The end-of-Age war: two armies facing each other across a border river at dusk, rows of bronze shields and spears and red banners on each bank, war chariots, a stormy red-orange sky. Tense and heroic, no fighting, no wounds, no blood. The middle calm sky above the river. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide composition, 16:9 aspect ratio.
```

**`bg-victory.png`** — 16:9 wide, opaque

```text
The final triumph: a victory procession through a great city at golden hour, crowds throwing flower petals, laurel garlands on every column, a gilded chariot, banners of every colour. Joyful and grand. The middle calm golden sky. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide composition, 16:9 aspect ratio.
```

**`bg-map.png`** — 16:9 wide, opaque

```text
An antique painted map of the eastern Mediterranean on aged parchment — Egypt, the Levant, Mesopotamia, Asia Minor, Greece and the Aegean islands — with small painted vignettes of ships and sea creatures in the water, a compass rose in one corner, faded colours. Low contrast, no place names, no labels. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Wide composition, 16:9 aspect ratio.
```

---

<a id="batch-14"></a>

## Batch 14 · Surfaces and ornaments (6)

**Setup block** — paste first:

```text
Painterly digital illustration in the manner of the 7 Wonders second-edition card art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; warm golden Mediterranean light against deep cool shadows; a rich palette of terracotta, ochre, sand, lapis blue, verdigris green and marble white, with the colour this prompt names leading the picture; the monumental ancient world of Egypt, Mesopotamia, Persia, Greece and Rome shown as living, prosperous, busy places; cinematic depth with a light haze and drifting dust in the air; heroic in scale, warm and inviting, never grim and never gory. No modern elements, no text, no lettering, no numbers, no signature, no watermark. This batch is surfaces and small ornaments that other art and the interface sit on: textures, a border band, a frame and a plaque. Keep every surface quiet, even and low in contrast with no focal point, so it never competes with what lies on top. One coherent set in polished marble, papyrus, gold and bronze. Each prompt names whether it is transparent, opaque or seamless, and its aspect ratio. No text, no lettering, no numbers, no watermark.
```

**`tex-marble.png`** — 1:1 square, opaque, seamless

```text
A seamless tileable texture of dark green-black marble (#1b2420) with fine pale gold veins, polished and low in contrast, no large features. A seamless tileable tile: opposite edges match exactly so it repeats with no visible seam, no large single feature. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no watermark. Square composition, 1:1 aspect ratio.
```

**`tex-papyrus.png`** — 1:1 square, opaque, seamless

```text
A seamless tileable texture of pale papyrus (#e9dcc0): the fine woven criss-cross of papyrus strips, faint fibres and a few soft stains, low in contrast. A seamless tileable tile: opposite edges match exactly so it repeats with no visible seam, no large single feature. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no watermark. Square composition, 1:1 aspect ratio.
```

**`band-greek-key.png`** — 4:1 wide, transparent, seamless left to right

```text
A horizontal decorative band: a continuous gold Greek-key (meander) pattern in polished gold (#d9a520) between two thin gold lines, crisp and even. It repeats seamlessly from left to right: the left and right edges match exactly. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no watermark. Wide composition, 4:1 aspect ratio.
```

**`frame-laurel.png`** — 1:1 square, transparent

```text
A round wreath of green and gold laurel leaves (#3f8a3a and #d9a520) tied with a small red ribbon at the bottom, the inside of the ring completely empty and transparent. The wreath centred and filling about 92% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`ornament-corner.png`** — 1:1 square, transparent

```text
An ornamental corner piece for a frame: polished gold (#d9a520) acanthus scrolls and a small palmette, fitting into the top-left corner with both arms running out along the top and left edges, everything else empty. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no watermark. Square composition, 1:1 aspect ratio.
```

**`plaque-stage.png`** — 3:1 wide, transparent

```text
An empty carved stone plaque for a wonder stage: a shallow rectangular panel of warm sandstone (#c9a36b) with bevelled edges and a thin gold inlay line inset from the edge, the centre smooth and empty for the icons the game adds. Seen straight on, centred and filling about 94% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Wide composition, 3:1 aspect ratio.
```

<a id="batch-15"></a>

## Batch 15 · Rail medallions (4)

**Setup block** — paste first:

```text
Painterly digital illustration in the manner of the 7 Wonders second-edition card art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; warm golden Mediterranean light against deep cool shadows; a rich palette of terracotta, ochre, sand, lapis blue, verdigris green and marble white, with the colour this prompt names leading the picture; the monumental ancient world of Egypt, Mesopotamia, Persia, Greece and Rome shown as living, prosperous, busy places; cinematic depth with a light haze and drifting dust in the air; heroic in scale, warm and inviting, never grim and never gory. No modern elements, no text, no lettering, no numbers, no signature, no watermark. This batch is one matched set of four navigation medallions that sit in a column, one above the other, so they must be identical in construction and differ only in the emblem at their centre: a perfectly round coin seen straight on, a polished gold rim (#d9a520) of the same thickness on every one, a deep lapis-blue enamel field (#24477a) with a faint radial sheen, and a single emblem raised in gold relief in the middle, filling about half of the field. The same light from the upper left on all four, the same size, the same rim, the same blue. In the same painted, glossy style as the round icons printed on the cards, readable at 32 px.
```

**`nav-table.png`** — 1:1 square, transparent

```text
The emblem: seven small gold columns standing evenly spaced in a ring around a tiny gold eight-pointed star — the seven cities seated around one table. A round medallion: a polished gold rim (#d9a520), a deep lapis-blue enamel field (#24477a), the emblem in raised gold relief in the centre. The medallion centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`nav-overview.png`** — 1:1 square, transparent

```text
The emblem: three gold stone tablets standing side by side, of three different heights, like a comparison carved in relief. A round medallion: a polished gold rim (#d9a520), a deep lapis-blue enamel field (#24477a), the emblem in raised gold relief in the centre. The medallion centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`nav-chains.png`** — 1:1 square, transparent

```text
The emblem: two interlocked gold chain links on a diagonal. A round medallion: a polished gold rim (#d9a520), a deep lapis-blue enamel field (#24477a), the emblem in raised gold relief in the centre. The medallion centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`nav-edifice.png`** — 1:1 square, transparent

```text
The emblem: a wooden builder's crane beside a half-built row of three columns, all in gold relief. A round medallion: a polished gold rim (#d9a520), a deep lapis-blue enamel field (#24477a), the emblem in raised gold relief in the centre. The medallion centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```
