# Lost Cities Art

Everything the Lost Cities board paints: the 60 expedition cards, the five trail paintings behind the board's columns, the expedition medallions and insignia and the card back. The board adds every number, name and score itself; the prompts generate **only pictures**.

Drop the raw PNGs into `packages/web/art-src/lost-cities/<name>.png` (gitignored; this file is the reproducible source) and convert them with `pnpm --filter @boardgames/web card-art --game=lost-cities`, which writes `assets/art/*.webp` per `assets/art/manifest.json`.

---

**Status (2026-11-10):** 77 prompts in 13 batches of at most 10. Nothing from this set is generated yet: until a batch is, the board shows the previous art converted into the new file names (Desert, Undersea, Himalaya, Rainforest) or a drawn fallback (Volcano, trails, insignia). Batch headings say `— pending` until their images are in `assets/art/`.

**How to use.** Work one batch at a time, in a fresh image-generator conversation:

1. Paste the batch's **setup block** first. It holds the base style, the cast sheet and the batch's own direction, so the whole batch shares one look and the same three people.
2. Then paste each item prompt of that batch in turn and save the result under the file name above it, in `packages/web/art-src/lost-cities/`.

If your generator does not remember the conversation, put the setup block in front of every item prompt instead. Every item prompt repeats its own crop, palette and aspect ratio, so it also works alone.

## Why the set is built this way

- **One cast sheet, pasted verbatim.** The old prompts described the explorers loosely, and their sex, age and looks drifted between images. The cast sheet below fixes each person's sex, age, skin, hair and clothes, and every card batch's setup block carries it word for word.
- **Each expedition is written backwards from its 10.** The destination is decided first, and every earlier card foreshadows it with the same few motifs, so the story builds to one climax. No card shows a place that has nothing to do with the destination (the old Desert 8 showed an unrelated city).
- **Rainforest now ends at a lost Maya city** (in the manner of Tikal) instead of the Hanging Gardens of Babylon, which stood in the Mesopotamian desert.
- **The art area is cropped.** The card face lays a black title band over the top of the card, so each picture keeps its subject in the middle eight tenths of its height.

## Base style directive

Every setup block starts with this, verbatim:

> Painterly digital illustration in the tradition of classic 1930s expedition adventure art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; cinematic depth with atmospheric haze and dramatic, warm-against-cool light; a sense of wonder and enormous scale, adventurous and inviting, never grim and never gory. The world is the 1930s: canvas, leather, brass, hurricane lamps, wooden boats and brass diving helmets; no modern equipment, no electronics, no plastic. No text, no lettering, no numbers, no signature, no watermark.

## Cast sheet

Every card batch's setup block carries this, verbatim:

> The expedition is always the same three people, drawn exactly like this whenever they appear (never add other expedition members, never change their sex, age, skin, hair or clothes): DR. AMARA OSEI, a woman of 52, Ghanaian-British, tall and lean with dark brown skin, close-cropped natural black hair with silver at the temples, small gold hoop earrings, an olive-green canvas field jacket with rolled sleeves over a cream linen shirt, a brown leather satchel and a worn leather-bound journal; she leads. FELIX NAVARRO, a man of 28, Spanish, medium build with light olive skin, tousled shoulder-length auburn hair and short auburn stubble, a rust-red neckerchief, a sand-coloured shirt with rolled sleeves, a brass compass on a chain and a leather map tube across his back; he navigates. LIAN ZHOU, a woman of 35, Chinese, short and slight, straight black hair in a blunt chin-length bob, round tortoiseshell spectacles, a navy utility vest over a white shirt, khaki trousers, a canvas notebook and a brass magnifying loupe on a cord; she reads the old scripts. In diving scenes all three wear brass-helmeted canvas diving suits, recognisable by Amara's height, Felix's rust-red neckerchief tied to his air hose and Lian's small frame. Locals they deal with are distinct people of the place, dressed for the 1930s.

## The story of every expedition

| Card | Beat |
| --- | --- |
| Wager 1 | Intel: trading something precious for the first clue to the destination |
| Wager 2 | Provisions: trading for the gear this particular journey needs |
| Wager 3 | Passage: a local guide or boat agrees to take them |
| 2 | First Light: the vast landscape, the explorers tiny, the destination a speck on the horizon |
| 3 | The Old Road: an ancient route that points at the destination |
| 4 | Fragments: a piece of the destination itself |
| 5 | Camp: night, the finds laid out, the destination glimpsed |
| 6 | The Passage: a way in, marked with the destination's motif |
| 7 | Trial: the darkest hour |
| 8 | Revelation: the first full sight of the destination's guardian or heart |
| 9 | The Gates: at the destination's threshold |
| 10 | The Wonder: the destination in its full ancient glory |

| Expedition | Colour | Destination |
| --- | --- | --- |
| Desert (`yellow`) | amber gold #f59e0b | The Pyramids of Giza |
| Undersea (`blue`) | sea blue #3b82f6 | Cleopatra's sunken palace at Alexandria |
| Himalaya (`white`) | ice white and silver #d1d5db | The Tiger's Nest monastery |
| Rainforest (`green`) | emerald green #22c55e | A lost Maya city in the rainforest |
| Volcano (`red`) | crimson and ember red #ef4444 | Pompeii beneath Vesuvius |

## Files

| File | Aspect ratio | Used on |
| --- | --- | --- |
| `card-{colour}-{w1,w2,w3,2…10}.png` ×60 | 2:3 opaque | card faces: hand, lines, camps, results |
| `trail-{colour}.png` ×5 | 9:21 opaque | the backdrop of each expedition's column on the board, and the results screen |
| `medal-{colour}.png` ×5 | 1:1 transparent | trail headers, results |
| `emblem-lost-cities.png`, `icon-camp.png`, `icon-wager.png`, `seal-bonus.png`, `icon-deck.png` | 1:1 transparent | setup, camps, wager and bonus marks, the deck |
| `back.png` | 2:3 opaque | the deck and every face-down card |

## Batches

| # | Batch | Prompts |
| --- | --- | --- |
| 01 | [Desert I — the journey begins (6)](#batch-01) | 6 |
| 02 | [Desert II — to the destination (6)](#batch-02) | 6 |
| 03 | [Undersea I — the journey begins (6)](#batch-03) | 6 |
| 04 | [Undersea II — to the destination (6)](#batch-04) | 6 |
| 05 | [Himalaya I — the journey begins (6)](#batch-05) | 6 |
| 06 | [Himalaya II — to the destination (6)](#batch-06) | 6 |
| 07 | [Rainforest I — the journey begins (6)](#batch-07) | 6 |
| 08 | [Rainforest II — to the destination (6)](#batch-08) | 6 |
| 09 | [Volcano I — the journey begins (6)](#batch-09) | 6 |
| 10 | [Volcano II — to the destination (6)](#batch-10) | 6 |
| 11 | [The five trails (5)](#batch-11) | 5 |
| 12 | [Medallions and insignia (10)](#batch-12) | 10 |
| 13 | [Card back (1)](#batch-13) | 1 |

---

<a id="batch-01"></a>

## Batch 01 · Desert I — the journey begins (6) — pending

**Setup block** — paste first:

```text
Painterly digital illustration in the tradition of classic 1930s expedition adventure art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; cinematic depth with atmospheric haze and dramatic, warm-against-cool light; a sense of wonder and enormous scale, adventurous and inviting, never grim and never gory. The world is the 1930s: canvas, leather, brass, hurricane lamps, wooden boats and brass diving helmets; no modern equipment, no electronics, no plastic. No text, no lettering, no numbers, no signature, no watermark. The expedition is always the same three people, drawn exactly like this whenever they appear (never add other expedition members, never change their sex, age, skin, hair or clothes): DR. AMARA OSEI, a woman of 52, Ghanaian-British, tall and lean with dark brown skin, close-cropped natural black hair with silver at the temples, small gold hoop earrings, an olive-green canvas field jacket with rolled sleeves over a cream linen shirt, a brown leather satchel and a worn leather-bound journal; she leads. FELIX NAVARRO, a man of 28, Spanish, medium build with light olive skin, tousled shoulder-length auburn hair and short auburn stubble, a rust-red neckerchief, a sand-coloured shirt with rolled sleeves, a brass compass on a chain and a leather map tube across his back; he navigates. LIAN ZHOU, a woman of 35, Chinese, short and slight, straight black hair in a blunt chin-length bob, round tortoiseshell spectacles, a navy utility vest over a white shirt, khaki trousers, a canvas notebook and a brass magnifying loupe on a cord; she reads the old scripts. In diving scenes all three wear brass-helmeted canvas diving suits, recognisable by Amara's height, Felix's rust-red neckerchief tied to his air hose and Lian's small frame. Locals they deal with are distinct people of the place, dressed for the 1930s. This batch is the Desert expedition, its first six cards: the three wagers, then 2 to 4. This expedition ends at the Pyramids of Giza in their ancient glory: three pyramids sheathed in polished white limestone, each crowned with a gilded capstone, the Great Sphinx freshly painted in front of them, the flooded Nile behind. Every earlier picture already points there through the same motifs: three triangles under the three stars of Orion's Belt, the glint of a gilded capstone, the Sphinx's gaze toward the sunrise, and the ancient stone causeways that lead to the pyramids. Nothing in the story belongs to any other place: no other city, temple or ruin appears. Strongly led by amber gold, sun-bleached sand and burnt orange, with deep indigo night skies where it is night (amber gold #f59e0b): the colour leads every picture in the batch. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-yellow-w1.png`** — Wager 1 · Intel · 2:3 card art, opaque

```text
At night in a cluttered Cairo antiquities shop, Amara slides a silver pocket watch across the counter to an elderly Egyptian dealer in a fez, who unrolls a brittle papyrus between them: on it, three small triangles drawn beneath the three stars of Orion's Belt. Lian leans in with her loupe. Lamplight in amber, blue night through the doorway. Strongly led by amber gold, sun-bleached sand and burnt orange, with deep indigo night skies where it is night. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-yellow-w2.png`** — Wager 2 · Provisions · 2:3 card art, opaque

```text
A busy riverside market on the Nile in the morning: Felix haggles with a Bedouin camel trader over three saddled camels, water skins, rope and a brass surveying theodolite laid on a rug. Far beyond the palms, in the golden haze, the faint tips of three triangles on the horizon. Strongly led by amber gold, sun-bleached sand and burnt orange, with deep indigo night skies where it is night. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-yellow-w3.png`** — Wager 3 · Passage · 2:3 card art, opaque

```text
At dusk on the Nile, a weathered felucca captain shakes Amara's hand on the deck of his boat as its great triangular sail fills; Lian holds up the papyrus with the three triangles. Above the sail, the three stars of Orion's Belt are coming out in the amber-and-indigo sky. Strongly led by amber gold, sun-bleached sand and burnt orange, with deep indigo night skies where it is night. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-yellow-2.png`** — 2 · First Light · 2:3 card art, opaque

```text
Dawn over an endless sea of amber dunes. The three explorers stand tiny on a dune crest at the bottom of the picture, their long shadows stretching ahead. On the far horizon, small and pale in the haze, three perfect triangles catch the first light. The scale is overwhelming. Strongly led by amber gold, sun-bleached sand and burnt orange, with deep indigo night skies where it is night. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-yellow-3.png`** — 3 · The Old Road · 2:3 card art, opaque

```text
A line of huge, half-buried limestone blocks runs straight across the sand toward the horizon, an ancient causeway. Felix kneels on the first block checking his brass compass against it; the causeway points exactly at three faint triangles in the far distance. Midday heat haze, amber light. Strongly led by amber gold, sun-bleached sand and burnt orange, with deep indigo night skies where it is night. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-yellow-4.png`** — 4 · Fragments · 2:3 card art, opaque

```text
In a shallow pit in the sand, Lian brushes dust from a fallen fragment of a gilded capstone: a block of polished white limestone whose gold-leafed face is carved with hieroglyphs and three stars. Amara crouches beside her holding the journal open; the gold gleams in the afternoon sun. Strongly led by amber gold, sun-bleached sand and burnt orange, with deep indigo night skies where it is night. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

---

<a id="batch-02"></a>

## Batch 02 · Desert II — to the destination (6) — pending

**Setup block** — paste first:

```text
Painterly digital illustration in the tradition of classic 1930s expedition adventure art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; cinematic depth with atmospheric haze and dramatic, warm-against-cool light; a sense of wonder and enormous scale, adventurous and inviting, never grim and never gory. The world is the 1930s: canvas, leather, brass, hurricane lamps, wooden boats and brass diving helmets; no modern equipment, no electronics, no plastic. No text, no lettering, no numbers, no signature, no watermark. The expedition is always the same three people, drawn exactly like this whenever they appear (never add other expedition members, never change their sex, age, skin, hair or clothes): DR. AMARA OSEI, a woman of 52, Ghanaian-British, tall and lean with dark brown skin, close-cropped natural black hair with silver at the temples, small gold hoop earrings, an olive-green canvas field jacket with rolled sleeves over a cream linen shirt, a brown leather satchel and a worn leather-bound journal; she leads. FELIX NAVARRO, a man of 28, Spanish, medium build with light olive skin, tousled shoulder-length auburn hair and short auburn stubble, a rust-red neckerchief, a sand-coloured shirt with rolled sleeves, a brass compass on a chain and a leather map tube across his back; he navigates. LIAN ZHOU, a woman of 35, Chinese, short and slight, straight black hair in a blunt chin-length bob, round tortoiseshell spectacles, a navy utility vest over a white shirt, khaki trousers, a canvas notebook and a brass magnifying loupe on a cord; she reads the old scripts. In diving scenes all three wear brass-helmeted canvas diving suits, recognisable by Amara's height, Felix's rust-red neckerchief tied to his air hose and Lian's small frame. Locals they deal with are distinct people of the place, dressed for the 1930s. This batch is the Desert expedition, its last six cards, 5 to 10. This expedition ends at the Pyramids of Giza in their ancient glory: three pyramids sheathed in polished white limestone, each crowned with a gilded capstone, the Great Sphinx freshly painted in front of them, the flooded Nile behind. Every earlier picture already points there through the same motifs: three triangles under the three stars of Orion's Belt, the glint of a gilded capstone, the Sphinx's gaze toward the sunrise, and the ancient stone causeways that lead to the pyramids. Nothing in the story belongs to any other place: no other city, temple or ruin appears. Strongly led by amber gold, sun-bleached sand and burnt orange, with deep indigo night skies where it is night (amber gold #f59e0b): the colour leads every picture in the batch. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-yellow-5.png`** — 5 · Camp · 2:3 card art, opaque

```text
Night camp in the desert: a canvas tent lit by a hurricane lamp beside the half-buried causeway, camels resting, the fragment of the gilded capstone on a folding table with Amara's journal. Overhead a vast starry sky with Orion's Belt bright and low over the horizon where three dark triangles stand against the stars. Strongly led by amber gold, sun-bleached sand and burnt orange, with deep indigo night skies where it is night. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-yellow-6.png`** — 6 · The Passage · 2:3 card art, opaque

```text
The sand has been dug away to reveal the entrance to Khafre's valley temple: massive pillars of polished red granite, sand pouring down the steps into darkness, and on the lintel the carved image of three pyramids. Felix holds a hurricane lamp at the threshold; Lian and Amara look inside. Strongly led by amber gold, sun-bleached sand and burnt orange, with deep indigo night skies where it is night. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-yellow-7.png`** — 7 · Trial · 2:3 card art, opaque

```text
A violent khamsin sandstorm swallows the causeway: a wall of orange dust towers over the three explorers, roped together and bent double against the wind, Amara in front. Through the storm, ahead, only the enormous dark outline of the Sphinx's head is visible. The darkest hour of the expedition. Strongly led by amber gold, sun-bleached sand and burnt orange, with deep indigo night skies where it is night. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-yellow-8.png`** — 8 · Revelation · 2:3 card art, opaque

```text
The storm has passed. In clear golden sunset light, the Great Sphinx rises enormous above the three tiny explorers, freshly painted in ochre, red and blue as in ancient times, its calm face lit gold. Behind it, still veiled in thinning haze, the gleaming white flank of a pyramid. Strongly led by amber gold, sun-bleached sand and burnt orange, with deep indigo night skies where it is night. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-yellow-9.png`** — 9 · The Gates · 2:3 card art, opaque

```text
At the top of the stone causeway, with the Sphinx behind them, the three explorers stop before the first pyramid: an immense wall of polished white limestone rising out of the frame, the gilded capstone blazing in the sun far above. Small figures, colossal monument. Strongly led by amber gold, sun-bleached sand and burnt orange, with deep indigo night skies where it is night. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-yellow-10.png`** — 10 · The Wonder · 2:3 card art, opaque

```text
The Pyramids of Giza in their full ancient glory at dusk: three pyramids of gleaming white limestone with gilded capstones, the painted Sphinx in front, the flooded Nile mirroring the sky, palm groves and a procession of torches along the causeway, and Orion's Belt rising above the three peaks. The three explorers stand tiny at the bottom, awestruck. Strongly led by amber gold, sun-bleached sand and burnt orange, with deep indigo night skies where it is night. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

---

<a id="batch-03"></a>

## Batch 03 · Undersea I — the journey begins (6) — pending

**Setup block** — paste first:

```text
Painterly digital illustration in the tradition of classic 1930s expedition adventure art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; cinematic depth with atmospheric haze and dramatic, warm-against-cool light; a sense of wonder and enormous scale, adventurous and inviting, never grim and never gory. The world is the 1930s: canvas, leather, brass, hurricane lamps, wooden boats and brass diving helmets; no modern equipment, no electronics, no plastic. No text, no lettering, no numbers, no signature, no watermark. The expedition is always the same three people, drawn exactly like this whenever they appear (never add other expedition members, never change their sex, age, skin, hair or clothes): DR. AMARA OSEI, a woman of 52, Ghanaian-British, tall and lean with dark brown skin, close-cropped natural black hair with silver at the temples, small gold hoop earrings, an olive-green canvas field jacket with rolled sleeves over a cream linen shirt, a brown leather satchel and a worn leather-bound journal; she leads. FELIX NAVARRO, a man of 28, Spanish, medium build with light olive skin, tousled shoulder-length auburn hair and short auburn stubble, a rust-red neckerchief, a sand-coloured shirt with rolled sleeves, a brass compass on a chain and a leather map tube across his back; he navigates. LIAN ZHOU, a woman of 35, Chinese, short and slight, straight black hair in a blunt chin-length bob, round tortoiseshell spectacles, a navy utility vest over a white shirt, khaki trousers, a canvas notebook and a brass magnifying loupe on a cord; she reads the old scripts. In diving scenes all three wear brass-helmeted canvas diving suits, recognisable by Amara's height, Felix's rust-red neckerchief tied to his air hose and Lian's small frame. Locals they deal with are distinct people of the place, dressed for the 1930s. This batch is the Undersea expedition, its first six cards: the three wagers, then 2 to 4. This expedition ends at Cleopatra's sunken palace on the drowned island of Antirhodos in Alexandria's harbour: a royal hall of red granite columns, gilded mosaics and a statue of the goddess Isis, lit by shafts of sunlight and divers' lamps. Every earlier picture already points there through the same motifs: the lighthouse of Pharos (or its fortress on the point), the goddess Isis with her horned sun-disc crown, red granite sphinxes with royal faces, and a key-shaped island drawn on an old chart. Nothing in the story belongs to any other place. Strongly led by deep sea blue, teal and navy, with warm amber only where a lamp or the sun reaches (sea blue #3b82f6): the colour leads every picture in the batch. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-blue-w1.png`** — Wager 1 · Intel · 2:3 card art, opaque

```text
A harbour café in Alexandria at night, lamps glowing: Amara trades a carved ivory chess piece to an old Egyptian fisherman, who spreads a hand-drawn chart of the harbour on the table; a key-shaped island is circled beside a sketch of a lighthouse. Lian copies the chart into her notebook. Blue night, warm lamplight. Strongly led by deep sea blue, teal and navy, with warm amber only where a lamp or the sun reaches. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-blue-w2.png`** — Wager 2 · Provisions · 2:3 card art, opaque

```text
A cluttered salvage yard on the Alexandria docks: Felix bargains with a burly Greek salvage master over three brass diving helmets, canvas diving suits, coils of air hose and a hand-cranked air pump. Behind them, across the water, the stone fortress on the point where the lighthouse once stood. Strongly led by deep sea blue, teal and navy, with warm amber only where a lamp or the sun reaches. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-blue-w3.png`** — Wager 3 · Passage · 2:3 card art, opaque

```text
Morning at the harbour: a Greek sponge-diving captain in a cap shakes Amara's hand aboard his blue-painted wooden boat, the air pump and helmets on deck, Lian pointing at the key-shaped island on the chart. The fortress on the point stands in the background over bright blue water. Strongly led by deep sea blue, teal and navy, with warm amber only where a lamp or the sun reaches. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-blue-2.png`** — 2 · First Light · 2:3 card art, opaque

```text
Dawn on the still eastern harbour of Alexandria: the boat is a small silhouette on glassy blue water, the three explorers leaning over the side. Through the clear water below, enormous pale shapes of fallen stone are faintly visible, outlining a drowned island. The fortress on the point in the soft distance. Strongly led by deep sea blue, teal and navy, with warm amber only where a lamp or the sun reaches. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-blue-3.png`** — 3 · The Old Road · 2:3 card art, opaque

```text
Underwater, first dive: a straight line of fallen granite blocks crosses the sandy seabed like a road into blue gloom. Felix, in a brass diving helmet with his rust-red neckerchief tied to the air hose, follows it with a lamp; shoals of silver fish part around him; sun rays slant down from the surface. Strongly led by deep sea blue, teal and navy, with warm amber only where a lamp or the sun reaches. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-blue-4.png`** — 4 · Fragments · 2:3 card art, opaque

```text
On the seabed, Lian in her diving suit fans silt away from the face of a red granite sphinx lying on its side: a royal face with a calm smile. Her lamp throws warm light on the stone; behind her, in the blue haze, the shadow of a standing column. Strongly led by deep sea blue, teal and navy, with warm amber only where a lamp or the sun reaches. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

---

<a id="batch-04"></a>

## Batch 04 · Undersea II — to the destination (6) — pending

**Setup block** — paste first:

```text
Painterly digital illustration in the tradition of classic 1930s expedition adventure art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; cinematic depth with atmospheric haze and dramatic, warm-against-cool light; a sense of wonder and enormous scale, adventurous and inviting, never grim and never gory. The world is the 1930s: canvas, leather, brass, hurricane lamps, wooden boats and brass diving helmets; no modern equipment, no electronics, no plastic. No text, no lettering, no numbers, no signature, no watermark. The expedition is always the same three people, drawn exactly like this whenever they appear (never add other expedition members, never change their sex, age, skin, hair or clothes): DR. AMARA OSEI, a woman of 52, Ghanaian-British, tall and lean with dark brown skin, close-cropped natural black hair with silver at the temples, small gold hoop earrings, an olive-green canvas field jacket with rolled sleeves over a cream linen shirt, a brown leather satchel and a worn leather-bound journal; she leads. FELIX NAVARRO, a man of 28, Spanish, medium build with light olive skin, tousled shoulder-length auburn hair and short auburn stubble, a rust-red neckerchief, a sand-coloured shirt with rolled sleeves, a brass compass on a chain and a leather map tube across his back; he navigates. LIAN ZHOU, a woman of 35, Chinese, short and slight, straight black hair in a blunt chin-length bob, round tortoiseshell spectacles, a navy utility vest over a white shirt, khaki trousers, a canvas notebook and a brass magnifying loupe on a cord; she reads the old scripts. In diving scenes all three wear brass-helmeted canvas diving suits, recognisable by Amara's height, Felix's rust-red neckerchief tied to his air hose and Lian's small frame. Locals they deal with are distinct people of the place, dressed for the 1930s. This batch is the Undersea expedition, its last six cards, 5 to 10. This expedition ends at Cleopatra's sunken palace on the drowned island of Antirhodos in Alexandria's harbour: a royal hall of red granite columns, gilded mosaics and a statue of the goddess Isis, lit by shafts of sunlight and divers' lamps. Every earlier picture already points there through the same motifs: the lighthouse of Pharos (or its fortress on the point), the goddess Isis with her horned sun-disc crown, red granite sphinxes with royal faces, and a key-shaped island drawn on an old chart. Nothing in the story belongs to any other place. Strongly led by deep sea blue, teal and navy, with warm amber only where a lamp or the sun reaches (sea blue #3b82f6): the colour leads every picture in the batch. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-blue-5.png`** — 5 · Camp · 2:3 card art, opaque

```text
Night on the moored dive boat: lanterns, the air pump, three brass helmets drying on deck, and on a crate a small salvaged statuette of Isis wearing her horned sun-disc crown, beside Amara's journal open on a sketch of a palace. Amara and Lian talk by the lamp; the lights of Alexandria glimmer across the black water. Strongly led by deep sea blue, teal and navy, with warm amber only where a lamp or the sun reaches. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-blue-6.png`** — 6 · The Passage · 2:3 card art, opaque

```text
Underwater, a long colonnade of red granite columns leads into deep darkness; a shoal of fish streams between them. Amara, tall in her diving suit, raises her lamp at the entrance; above the first columns, a carved relief of Isis is half hidden by sea growth. Strongly led by deep sea blue, teal and navy, with warm amber only where a lamp or the sun reaches. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-blue-7.png`** — 7 · Trial · 2:3 card art, opaque

```text
A disaster in murky water: a column has toppled in a cloud of silt and pinned Felix's air hose. Amara and Lian strain to lift the stone while bubbles burst from the hose; their lamps barely cut the brown-blue murk. The darkest hour of the expedition. Strongly led by deep sea blue, teal and navy, with warm amber only where a lamp or the sun reaches. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-blue-8.png`** — 8 · Revelation · 2:3 card art, opaque

```text
The silt has settled. In a great shaft of sunlight from the surface, a colossal statue of the goddess Isis stands upright on the seabed, her horned sun-disc crown catching the light, her face serene. The three divers float small before her. Strongly led by deep sea blue, teal and navy, with warm amber only where a lamp or the sun reaches. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-blue-9.png`** — 9 · The Gates · 2:3 card art, opaque

```text
Two huge red granite sphinxes with royal faces flank a vast doorway on the seabed, the entrance of a drowned palace; gilded mosaic glints inside. The three divers swim toward it in a line, lamps lit, tiny against the gate. Strongly led by deep sea blue, teal and navy, with warm amber only where a lamp or the sun reaches. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-blue-10.png`** — 10 · The Wonder · 2:3 card art, opaque

```text
Cleopatra's palace hall beneath the sea in its full glory: a forest of red granite columns, gilded mosaic floors, a throne dais with a statue of Isis, the whole hall lit by shafts of sunlight and the lamps of the three tiny divers at the bottom; silver fish wheel through it like birds. Strongly led by deep sea blue, teal and navy, with warm amber only where a lamp or the sun reaches. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

---

<a id="batch-05"></a>

## Batch 05 · Himalaya I — the journey begins (6) — pending

**Setup block** — paste first:

```text
Painterly digital illustration in the tradition of classic 1930s expedition adventure art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; cinematic depth with atmospheric haze and dramatic, warm-against-cool light; a sense of wonder and enormous scale, adventurous and inviting, never grim and never gory. The world is the 1930s: canvas, leather, brass, hurricane lamps, wooden boats and brass diving helmets; no modern equipment, no electronics, no plastic. No text, no lettering, no numbers, no signature, no watermark. The expedition is always the same three people, drawn exactly like this whenever they appear (never add other expedition members, never change their sex, age, skin, hair or clothes): DR. AMARA OSEI, a woman of 52, Ghanaian-British, tall and lean with dark brown skin, close-cropped natural black hair with silver at the temples, small gold hoop earrings, an olive-green canvas field jacket with rolled sleeves over a cream linen shirt, a brown leather satchel and a worn leather-bound journal; she leads. FELIX NAVARRO, a man of 28, Spanish, medium build with light olive skin, tousled shoulder-length auburn hair and short auburn stubble, a rust-red neckerchief, a sand-coloured shirt with rolled sleeves, a brass compass on a chain and a leather map tube across his back; he navigates. LIAN ZHOU, a woman of 35, Chinese, short and slight, straight black hair in a blunt chin-length bob, round tortoiseshell spectacles, a navy utility vest over a white shirt, khaki trousers, a canvas notebook and a brass magnifying loupe on a cord; she reads the old scripts. In diving scenes all three wear brass-helmeted canvas diving suits, recognisable by Amara's height, Felix's rust-red neckerchief tied to his air hose and Lian's small frame. Locals they deal with are distinct people of the place, dressed for the 1930s. This batch is the Himalaya expedition, its first six cards: the three wagers, then 2 to 4. This expedition ends at the Tiger's Nest, Paro Taktsang: whitewashed temple halls with golden roofs clinging to a sheer cliff above the clouds, prayer flags arcing between them and a waterfall falling past the walls. Every earlier picture already points there through the same motifs: a flying tigress, the white walls and golden roofs on a cliff, strings of prayer flags, and a carved stone stairway climbing toward the clouds. Nothing in the story belongs to any other place. Strongly led by ice white, silver grey and cold blue, with warm gold only on the monastery roofs and in lamplight (ice white and silver #d1d5db): the colour leads every picture in the batch. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-white-w1.png`** — Wager 1 · Intel · 2:3 card art, opaque

```text
A small wooden teahouse in the Paro valley, butter lamps glowing: Amara gives a silver bracelet to an elderly monk in maroon robes, who unrolls a painted thangka on the table showing a tigress flying to a white temple on a cliff. Lian studies its inscription with her loupe; snowy peaks through the window. Strongly led by ice white, silver grey and cold blue, with warm gold only on the monastery roofs and in lamplight. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-white-w2.png`** — Wager 2 · Provisions · 2:3 card art, opaque

```text
An outfitter's shop in a mountain village: Felix trades his spare brass sextant to a Bhutanese outfitter for coils of hemp rope, ice axes, yak-wool coats and snow goggles piled on the counter. On the wall hangs a faded string of prayer flags. Strongly led by ice white, silver grey and cold blue, with warm gold only on the monastery roofs and in lamplight. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-white-w3.png`** — Wager 3 · Passage · 2:3 card art, opaque

```text
At a misty high pass strung with prayer flags, a yak herder in a woollen robe agrees to lead the expedition, his laden yaks waiting in a line; Amara shakes his hand while Lian holds up the painted thangka of the flying tigress. Snow peaks above the mist. Strongly led by ice white, silver grey and cold blue, with warm gold only on the monastery roofs and in lamplight. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-white-2.png`** — 2 · First Light · 2:3 card art, opaque

```text
Dawn over the Himalaya: an endless sea of snow-covered summits glowing pink and gold, deep blue valleys below. The three explorers stand tiny on a rocky ridge at the bottom of the picture. Far off, on one sheer cliff, a speck of white and gold catches the first light. Strongly led by ice white, silver grey and cold blue, with warm gold only on the monastery roofs and in lamplight. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-white-3.png`** — 3 · The Old Road · 2:3 card art, opaque

```text
An ancient pilgrim path winds along a mountainside, edged with carved mani stones; on one stone a tigress is carved among the prayers. Felix crouches to read his compass beside it; prayer flags flutter overhead and the path disappears around the cliff toward the clouds. Strongly led by ice white, silver grey and cold blue, with warm gold only on the monastery roofs and in lamplight. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-white-4.png`** — 4 · Fragments · 2:3 card art, opaque

```text
In fresh snow beside a small white chorten, Lian lifts a fallen golden roof finial, bent but gleaming, from the drift; Amara holds the journal open on a sketch of the same finial on a temple roof. Cold blue light, the gold glowing warm. Strongly led by ice white, silver grey and cold blue, with warm gold only on the monastery roofs and in lamplight. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

---

<a id="batch-06"></a>

## Batch 06 · Himalaya II — to the destination (6) — pending

**Setup block** — paste first:

```text
Painterly digital illustration in the tradition of classic 1930s expedition adventure art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; cinematic depth with atmospheric haze and dramatic, warm-against-cool light; a sense of wonder and enormous scale, adventurous and inviting, never grim and never gory. The world is the 1930s: canvas, leather, brass, hurricane lamps, wooden boats and brass diving helmets; no modern equipment, no electronics, no plastic. No text, no lettering, no numbers, no signature, no watermark. The expedition is always the same three people, drawn exactly like this whenever they appear (never add other expedition members, never change their sex, age, skin, hair or clothes): DR. AMARA OSEI, a woman of 52, Ghanaian-British, tall and lean with dark brown skin, close-cropped natural black hair with silver at the temples, small gold hoop earrings, an olive-green canvas field jacket with rolled sleeves over a cream linen shirt, a brown leather satchel and a worn leather-bound journal; she leads. FELIX NAVARRO, a man of 28, Spanish, medium build with light olive skin, tousled shoulder-length auburn hair and short auburn stubble, a rust-red neckerchief, a sand-coloured shirt with rolled sleeves, a brass compass on a chain and a leather map tube across his back; he navigates. LIAN ZHOU, a woman of 35, Chinese, short and slight, straight black hair in a blunt chin-length bob, round tortoiseshell spectacles, a navy utility vest over a white shirt, khaki trousers, a canvas notebook and a brass magnifying loupe on a cord; she reads the old scripts. In diving scenes all three wear brass-helmeted canvas diving suits, recognisable by Amara's height, Felix's rust-red neckerchief tied to his air hose and Lian's small frame. Locals they deal with are distinct people of the place, dressed for the 1930s. This batch is the Himalaya expedition, its last six cards, 5 to 10. This expedition ends at the Tiger's Nest, Paro Taktsang: whitewashed temple halls with golden roofs clinging to a sheer cliff above the clouds, prayer flags arcing between them and a waterfall falling past the walls. Every earlier picture already points there through the same motifs: a flying tigress, the white walls and golden roofs on a cliff, strings of prayer flags, and a carved stone stairway climbing toward the clouds. Nothing in the story belongs to any other place. Strongly led by ice white, silver grey and cold blue, with warm gold only on the monastery roofs and in lamplight (ice white and silver #d1d5db): the colour leads every picture in the batch. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-white-5.png`** — 5 · Camp · 2:3 card art, opaque

```text
Night in a stone pilgrims' hut high on the mountain: butter lamps, yak-wool blankets, tin mugs steaming, the golden finial and the thangka of the flying tigress on a low table. Amara and Felix bend over a map; through the doorway, moonlit peaks and a cliff with a faint glimmer of white walls. Strongly led by ice white, silver grey and cold blue, with warm gold only on the monastery roofs and in lamplight. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-white-6.png`** — 6 · The Passage · 2:3 card art, opaque

```text
A narrow path carved into a vertical cliff face, lined with turning prayer wheels, leads into the clouds. Lian spins a prayer wheel as she passes, Felix ahead with the rope; far above, through a gap in the cloud, the corner of a golden roof. Strongly led by ice white, silver grey and cold blue, with warm gold only on the monastery roofs and in lamplight. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-white-7.png`** — 7 · Trial · 2:3 card art, opaque

```text
A snowstorm on a fraying rope bridge over a bottomless chasm: the three explorers cling to the ropes, Amara reaching back for Lian, the bridge swinging, the prayer flags torn sideways by the wind. The darkest hour of the expedition. Strongly led by ice white, silver grey and cold blue, with warm gold only on the monastery roofs and in lamplight. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-white-8.png`** — 8 · Revelation · 2:3 card art, opaque

```text
The storm breaks. Clouds part to reveal, high on a sheer cliff across the gorge, the white walls and golden roofs of a temple glowing in the sun; in the fresh snow at the explorers' feet, a line of tigress paw prints leads toward it. The three stand tiny, astonished. Strongly led by ice white, silver grey and cold blue, with warm gold only on the monastery roofs and in lamplight. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-white-9.png`** — 9 · The Gates · 2:3 card art, opaque

```text
The final stairway carved into the cliff, a waterfall plunging beside it, climbs to a carved wooden gate painted with a flying tigress; prayer flags arc above. The three explorers stand at the bottom of the stairs, small against the cliff. Strongly led by ice white, silver grey and cold blue, with warm gold only on the monastery roofs and in lamplight. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-white-10.png`** — 10 · The Wonder · 2:3 card art, opaque

```text
The Tiger's Nest in its full glory: whitewashed temple halls with golden roofs clinging to a sheer cliff above a sea of clouds, prayer flags arcing between the buildings, a waterfall falling past the walls, monks on the balconies. The three explorers stand tiny on the approach stairway, gazing up in reverence. Strongly led by ice white, silver grey and cold blue, with warm gold only on the monastery roofs and in lamplight. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

---

<a id="batch-07"></a>

## Batch 07 · Rainforest I — the journey begins (6) — pending

**Setup block** — paste first:

```text
Painterly digital illustration in the tradition of classic 1930s expedition adventure art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; cinematic depth with atmospheric haze and dramatic, warm-against-cool light; a sense of wonder and enormous scale, adventurous and inviting, never grim and never gory. The world is the 1930s: canvas, leather, brass, hurricane lamps, wooden boats and brass diving helmets; no modern equipment, no electronics, no plastic. No text, no lettering, no numbers, no signature, no watermark. The expedition is always the same three people, drawn exactly like this whenever they appear (never add other expedition members, never change their sex, age, skin, hair or clothes): DR. AMARA OSEI, a woman of 52, Ghanaian-British, tall and lean with dark brown skin, close-cropped natural black hair with silver at the temples, small gold hoop earrings, an olive-green canvas field jacket with rolled sleeves over a cream linen shirt, a brown leather satchel and a worn leather-bound journal; she leads. FELIX NAVARRO, a man of 28, Spanish, medium build with light olive skin, tousled shoulder-length auburn hair and short auburn stubble, a rust-red neckerchief, a sand-coloured shirt with rolled sleeves, a brass compass on a chain and a leather map tube across his back; he navigates. LIAN ZHOU, a woman of 35, Chinese, short and slight, straight black hair in a blunt chin-length bob, round tortoiseshell spectacles, a navy utility vest over a white shirt, khaki trousers, a canvas notebook and a brass magnifying loupe on a cord; she reads the old scripts. In diving scenes all three wear brass-helmeted canvas diving suits, recognisable by Amara's height, Felix's rust-red neckerchief tied to his air hose and Lian's small frame. Locals they deal with are distinct people of the place, dressed for the 1930s. This batch is the Rainforest expedition, its first six cards: the three wagers, then 2 to 4. This expedition ends at a lost Maya city in the Petén rainforest, in the manner of Tikal: steep stepped temple pyramids, painted red, whose carved roof combs rise above the rainforest canopy around a great plaza of carved stelae, quetzal birds flying across the mist. Every earlier picture already points there through the same motifs: the jaguar (a jade jaguar pendant, a jaguar lord carved on stone, a real jaguar), the pale roof combs piercing the canopy, white limestone causeways, and carved stelae. Nothing in the story belongs to any other place: no gardens, no other civilisation. Strongly led by emerald and jungle green with mist, with warm limestone and red-painted stone only where the city shows (emerald green #22c55e): the colour leads every picture in the batch. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-green-w1.png`** — Wager 1 · Intel · 2:3 card art, opaque

```text
A palm-thatched market stall in a Guatemalan lake town at dusk: Amara trades a tin of tobacco and a silver coin to an old chiclero (a rubber-tapper) who opens his hand to show a carved jade jaguar pendant and sketches, on a scrap of paper, a stepped pyramid above the trees. Lian examines the glyphs on the jade with her loupe. Strongly led by emerald and jungle green with mist, with warm limestone and red-painted stone only where the city shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-green-w2.png`** — Wager 2 · Provisions · 2:3 card art, opaque

```text
A frontier town's general store: Felix bargains with the storekeeper over machetes, canvas hammocks, mosquito nets, a coil of rope and two pack mules waiting outside the open door, where the green wall of the rainforest begins. Strongly led by emerald and jungle green with mist, with warm limestone and red-painted stone only where the city shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-green-w3.png`** — Wager 3 · Passage · 2:3 card art, opaque

```text
Morning mist on a jungle lake: a Maya boatman in a straw hat agrees to take the expedition in his long dugout canoe; Amara shakes his hand, Lian shows him the jade jaguar pendant, and he points across the water to where the forest rises. Strongly led by emerald and jungle green with mist, with warm limestone and red-painted stone only where the city shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-green-2.png`** — 2 · First Light · 2:3 card art, opaque

```text
Dawn from a high ridge: an endless rolling canopy of emerald rainforest under drifting mist, as far as the eye can see. The three explorers stand tiny at the bottom of the picture. Far off, a single pale stone point rises just above the treetops. Strongly led by emerald and jungle green with mist, with warm limestone and red-painted stone only where the city shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-green-3.png`** — 3 · The Old Road · 2:3 card art, opaque

```text
A raised white limestone causeway runs straight through the rainforest, half swallowed by roots and vines, sunbeams falling on it through the canopy. Felix hacks a vine away with his machete and checks his compass; the causeway runs on into green shadow. Strongly led by emerald and jungle green with mist, with warm limestone and red-painted stone only where the city shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-green-4.png`** — 4 · Fragments · 2:3 card art, opaque

```text
Strangler-fig roots wrap a tall carved stela in a clearing: a jaguar lord in a feathered headdress surrounded by glyphs. Lian brushes moss from the glyphs with her fingers while Amara holds the jade jaguar pendant up beside the carving; the same jaguar. Strongly led by emerald and jungle green with mist, with warm limestone and red-painted stone only where the city shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

---

<a id="batch-08"></a>

## Batch 08 · Rainforest II — to the destination (6) — pending

**Setup block** — paste first:

```text
Painterly digital illustration in the tradition of classic 1930s expedition adventure art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; cinematic depth with atmospheric haze and dramatic, warm-against-cool light; a sense of wonder and enormous scale, adventurous and inviting, never grim and never gory. The world is the 1930s: canvas, leather, brass, hurricane lamps, wooden boats and brass diving helmets; no modern equipment, no electronics, no plastic. No text, no lettering, no numbers, no signature, no watermark. The expedition is always the same three people, drawn exactly like this whenever they appear (never add other expedition members, never change their sex, age, skin, hair or clothes): DR. AMARA OSEI, a woman of 52, Ghanaian-British, tall and lean with dark brown skin, close-cropped natural black hair with silver at the temples, small gold hoop earrings, an olive-green canvas field jacket with rolled sleeves over a cream linen shirt, a brown leather satchel and a worn leather-bound journal; she leads. FELIX NAVARRO, a man of 28, Spanish, medium build with light olive skin, tousled shoulder-length auburn hair and short auburn stubble, a rust-red neckerchief, a sand-coloured shirt with rolled sleeves, a brass compass on a chain and a leather map tube across his back; he navigates. LIAN ZHOU, a woman of 35, Chinese, short and slight, straight black hair in a blunt chin-length bob, round tortoiseshell spectacles, a navy utility vest over a white shirt, khaki trousers, a canvas notebook and a brass magnifying loupe on a cord; she reads the old scripts. In diving scenes all three wear brass-helmeted canvas diving suits, recognisable by Amara's height, Felix's rust-red neckerchief tied to his air hose and Lian's small frame. Locals they deal with are distinct people of the place, dressed for the 1930s. This batch is the Rainforest expedition, its last six cards, 5 to 10. This expedition ends at a lost Maya city in the Petén rainforest, in the manner of Tikal: steep stepped temple pyramids, painted red, whose carved roof combs rise above the rainforest canopy around a great plaza of carved stelae, quetzal birds flying across the mist. Every earlier picture already points there through the same motifs: the jaguar (a jade jaguar pendant, a jaguar lord carved on stone, a real jaguar), the pale roof combs piercing the canopy, white limestone causeways, and carved stelae. Nothing in the story belongs to any other place: no gardens, no other civilisation. Strongly led by emerald and jungle green with mist, with warm limestone and red-painted stone only where the city shows (emerald green #22c55e): the colour leads every picture in the batch. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-green-5.png`** — 5 · Camp · 2:3 card art, opaque

```text
Night camp on a ruined stone platform in the jungle: three hammocks under mosquito nets, a small fire, fireflies everywhere, the mules tethered. On a crate, Amara's journal is open on a sketch of a temple with a tall roof comb beside the jade jaguar pendant. Strongly led by emerald and jungle green with mist, with warm limestone and red-painted stone only where the city shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-green-6.png`** — 6 · The Passage · 2:3 card art, opaque

```text
A corbelled stone archway, Maya-style with stepped sides, opens into the dark interior of an overgrown pyramid base; painted red plaster and carved jaguars survive on the inner walls. Felix holds a hurricane lamp at the entrance, Lian and Amara behind him. Strongly led by emerald and jungle green with mist, with warm limestone and red-painted stone only where the city shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-green-7.png`** — 7 · Trial · 2:3 card art, opaque

```text
A night river crossing in a flash flood: brown water surges around the mules and the three explorers, Felix hauling on the rope, Amara holding Lian's arm; on the far bank, in the lightning, the eyes of a jaguar shine from the undergrowth. The darkest hour of the expedition. Strongly led by emerald and jungle green with mist, with warm limestone and red-painted stone only where the city shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-green-8.png`** — 8 · Revelation · 2:3 card art, opaque

```text
At sunrise, from the top of a giant ceiba tree, the three explorers look out over the canopy and see two great temple roof combs rising out of the mist above the trees, pale gold in the first light; toucans in the branches nearby. Strongly led by emerald and jungle green with mist, with warm limestone and red-painted stone only where the city shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-green-9.png`** — 9 · The Gates · 2:3 card art, opaque

```text
The edge of the great plaza: a row of carved stelae and a stone causeway lead to the foot of an immense steep pyramid painted red, the Temple of the Great Jaguar, its stairway climbing out of the frame. The three explorers stand small at its foot. Strongly led by emerald and jungle green with mist, with warm limestone and red-painted stone only where the city shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-green-10.png`** — 10 · The Wonder · 2:3 card art, opaque

```text
The lost Maya city in its full glory: steep temple pyramids painted red rising above the emerald canopy around a great plaza of carved stelae, their roof combs carved with jaguar lords, smoke of offerings drifting, quetzal birds with long green tails flying through the morning mist. The three explorers stand tiny on a temple stair, gazing out. Strongly led by emerald and jungle green with mist, with warm limestone and red-painted stone only where the city shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

---

<a id="batch-09"></a>

## Batch 09 · Volcano I — the journey begins (6) — pending

**Setup block** — paste first:

```text
Painterly digital illustration in the tradition of classic 1930s expedition adventure art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; cinematic depth with atmospheric haze and dramatic, warm-against-cool light; a sense of wonder and enormous scale, adventurous and inviting, never grim and never gory. The world is the 1930s: canvas, leather, brass, hurricane lamps, wooden boats and brass diving helmets; no modern equipment, no electronics, no plastic. No text, no lettering, no numbers, no signature, no watermark. The expedition is always the same three people, drawn exactly like this whenever they appear (never add other expedition members, never change their sex, age, skin, hair or clothes): DR. AMARA OSEI, a woman of 52, Ghanaian-British, tall and lean with dark brown skin, close-cropped natural black hair with silver at the temples, small gold hoop earrings, an olive-green canvas field jacket with rolled sleeves over a cream linen shirt, a brown leather satchel and a worn leather-bound journal; she leads. FELIX NAVARRO, a man of 28, Spanish, medium build with light olive skin, tousled shoulder-length auburn hair and short auburn stubble, a rust-red neckerchief, a sand-coloured shirt with rolled sleeves, a brass compass on a chain and a leather map tube across his back; he navigates. LIAN ZHOU, a woman of 35, Chinese, short and slight, straight black hair in a blunt chin-length bob, round tortoiseshell spectacles, a navy utility vest over a white shirt, khaki trousers, a canvas notebook and a brass magnifying loupe on a cord; she reads the old scripts. In diving scenes all three wear brass-helmeted canvas diving suits, recognisable by Amara's height, Felix's rust-red neckerchief tied to his air hose and Lian's small frame. Locals they deal with are distinct people of the place, dressed for the 1930s. This batch is the Volcano expedition, its first six cards: the three wagers, then 2 to 4. This expedition ends at Pompeii in its full ancient glory, the city as it was before AD 79: the Forum with the Temple of Jupiter, colonnades and painted houses, Vesuvius rising green and quiet behind it with a thin plume of smoke. Every earlier picture already points there through the same motifs: the double peak of Vesuvius with its plume, the deep Pompeian red of the wall frescoes, Roman stone streets with cart ruts, and mosaics (a dog mosaic at a doorway). Nothing in the story belongs to any other place. Strongly led by Pompeian red, ember orange and charcoal ash grey, with the cool blue of the bay where it shows (crimson and ember red #ef4444): the colour leads every picture in the batch. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-red-w1.png`** — Wager 1 · Intel · 2:3 card art, opaque

```text
A crowded antiquarian bookshop in Naples at night: Amara trades a gold signet ring to an old Neapolitan bookseller, who unfolds an eighteenth-century excavator's map of buried streets, a smoking double-peaked mountain drawn at its corner. Lian reads the Latin notes with her loupe; lamplight in warm red. Strongly led by Pompeian red, ember orange and charcoal ash grey, with the cool blue of the bay where it shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-red-w2.png`** — Wager 2 · Provisions · 2:3 card art, opaque

```text
A Naples ironmonger's shop: Felix bargains with the shopkeeper for spades, picks, hurricane lamps, brushes and sieves on the counter; through the open shop window, across the bay, Vesuvius smokes against a red sky. Strongly led by Pompeian red, ember orange and charcoal ash grey, with the cool blue of the bay where it shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-red-w3.png`** — Wager 3 · Passage · 2:3 card art, opaque

```text
On the coast road along the Bay of Naples at sunset, a carter with a mule cart agrees to carry the expedition and its tools; Amara shakes his hand, Lian holds the old map, and Vesuvius looms over them trailing a thin plume of smoke. Strongly led by Pompeian red, ember orange and charcoal ash grey, with the cool blue of the bay where it shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-red-2.png`** — 2 · First Light · 2:3 card art, opaque

```text
Dawn from the slopes above the bay: the Bay of Naples in pale blue below, and Vesuvius filling the sky, dark and enormous, smoke glowing red at the summit. The three explorers stand tiny on a path through the vineyards at the bottom of the picture. Strongly led by Pompeian red, ember orange and charcoal ash grey, with the cool blue of the bay where it shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-red-3.png`** — 3 · The Old Road · 2:3 card art, opaque

```text
A Roman paved road with deep cart ruts emerges from fields of grey ash and pumice; Felix walks along one rut with his compass, Vesuvius smoking in the background, the stones leading toward a low mound in the distance. Strongly led by Pompeian red, ember orange and charcoal ash grey, with the cool blue of the bay where it shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-red-4.png`** — 4 · Fragments · 2:3 card art, opaque

```text
In a trench of grey pumice, Lian uncovers a fragment of wall fresco in deep Pompeian red: a painted garden and a bird, the colours as bright as the day they were painted. Amara kneels beside her holding a hurricane lamp; ash dust in the air. Strongly led by Pompeian red, ember orange and charcoal ash grey, with the cool blue of the bay where it shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

---

<a id="batch-10"></a>

## Batch 10 · Volcano II — to the destination (6) — pending

**Setup block** — paste first:

```text
Painterly digital illustration in the tradition of classic 1930s expedition adventure art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; cinematic depth with atmospheric haze and dramatic, warm-against-cool light; a sense of wonder and enormous scale, adventurous and inviting, never grim and never gory. The world is the 1930s: canvas, leather, brass, hurricane lamps, wooden boats and brass diving helmets; no modern equipment, no electronics, no plastic. No text, no lettering, no numbers, no signature, no watermark. The expedition is always the same three people, drawn exactly like this whenever they appear (never add other expedition members, never change their sex, age, skin, hair or clothes): DR. AMARA OSEI, a woman of 52, Ghanaian-British, tall and lean with dark brown skin, close-cropped natural black hair with silver at the temples, small gold hoop earrings, an olive-green canvas field jacket with rolled sleeves over a cream linen shirt, a brown leather satchel and a worn leather-bound journal; she leads. FELIX NAVARRO, a man of 28, Spanish, medium build with light olive skin, tousled shoulder-length auburn hair and short auburn stubble, a rust-red neckerchief, a sand-coloured shirt with rolled sleeves, a brass compass on a chain and a leather map tube across his back; he navigates. LIAN ZHOU, a woman of 35, Chinese, short and slight, straight black hair in a blunt chin-length bob, round tortoiseshell spectacles, a navy utility vest over a white shirt, khaki trousers, a canvas notebook and a brass magnifying loupe on a cord; she reads the old scripts. In diving scenes all three wear brass-helmeted canvas diving suits, recognisable by Amara's height, Felix's rust-red neckerchief tied to his air hose and Lian's small frame. Locals they deal with are distinct people of the place, dressed for the 1930s. This batch is the Volcano expedition, its last six cards, 5 to 10. This expedition ends at Pompeii in its full ancient glory, the city as it was before AD 79: the Forum with the Temple of Jupiter, colonnades and painted houses, Vesuvius rising green and quiet behind it with a thin plume of smoke. Every earlier picture already points there through the same motifs: the double peak of Vesuvius with its plume, the deep Pompeian red of the wall frescoes, Roman stone streets with cart ruts, and mosaics (a dog mosaic at a doorway). Nothing in the story belongs to any other place. Strongly led by Pompeian red, ember orange and charcoal ash grey, with the cool blue of the bay where it shows (crimson and ember red #ef4444): the colour leads every picture in the batch. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-red-5.png`** — 5 · Camp · 2:3 card art, opaque

```text
Night camp in a vineyard on the volcano's slope: a canvas tent, a lantern, tools stacked, the red fresco fragment wrapped in cloth on a folding table beside Amara's journal. Above them, the summit of Vesuvius glows faint red against the stars. Strongly led by Pompeian red, ember orange and charcoal ash grey, with the cool blue of the bay where it shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-red-6.png`** — 6 · The Passage · 2:3 card art, opaque

```text
A buried doorway dug free from the ash: on its threshold a black-and-white Roman mosaic of a chained dog, and beyond it a dark hall with red-painted walls. Felix holds a lamp at the threshold; Lian and Amara lean in behind him. Strongly led by Pompeian red, ember orange and charcoal ash grey, with the cool blue of the bay where it shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-red-7.png`** — 7 · Trial · 2:3 card art, opaque

```text
The mountain wakes: a tremor shakes the excavation, grey ash falls like snow and stones crack, and the three explorers run through a narrow Roman street holding cloths to their faces, Amara pulling Lian along, Vesuvius erupting red and black above. The darkest hour of the expedition. Strongly led by Pompeian red, ember orange and charcoal ash grey, with the cool blue of the bay where it shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-red-8.png`** — 8 · Revelation · 2:3 card art, opaque

```text
The ash has settled and the sun breaks through: before the three explorers, an excavated villa room with every wall covered in brilliant Pompeian red frescoes of a ceremony, figures and garlands perfectly preserved, sunlight pouring in. Strongly led by Pompeian red, ember orange and charcoal ash grey, with the cool blue of the bay where it shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-red-9.png`** — 9 · The Gates · 2:3 card art, opaque

```text
The Marina Gate of Pompeii: a steep Roman stone ramp rising to a tall arched gateway in the city wall, with Vesuvius behind the city beyond. The three explorers stand small at the bottom of the ramp, looking up. Strongly led by Pompeian red, ember orange and charcoal ash grey, with the cool blue of the bay where it shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

**`card-red-10.png`** — 10 · The Wonder · 2:3 card art, opaque

```text
Pompeii in its full ancient glory before AD 79: the Forum with the Temple of Jupiter and its white columns, colonnades and red-and-ochre painted houses, citizens in togas and market awnings, and Vesuvius rising green and peaceful behind the city with a thin plume of smoke. The three explorers stand tiny on the temple steps, looking out. Strongly led by Pompeian red, ember orange and charcoal ash grey, with the cool blue of the bay where it shows. Portrait 2:3 aspect ratio. The game crops the top and bottom tenth of the picture and lays its own black title band above it, so keep everything important inside the middle eight tenths of the height and keep the subject readable as a small thumbnail. An opaque image filling the whole canvas edge to edge, no border, no frame, no text, no lettering, no numbers, no watermark.
```

---

<a id="batch-11"></a>

## Batch 11 · The five trails (5) — pending

**Setup block** — paste first:

```text
Painterly digital illustration in the tradition of classic 1930s expedition adventure art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; cinematic depth with atmospheric haze and dramatic, warm-against-cool light; a sense of wonder and enormous scale, adventurous and inviting, never grim and never gory. The world is the 1930s: canvas, leather, brass, hurricane lamps, wooden boats and brass diving helmets; no modern equipment, no electronics, no plastic. No text, no lettering, no numbers, no signature, no watermark. This batch is the five trail paintings of the Lost Cities board: one tall painting per expedition, each showing that expedition's whole route from its starting point at the bottom to its destination at the top. The five hang side by side as the board's columns, so they share the same format, the same horizon of the destination at the very top and the same calm middle, while each keeps its own expedition colour leading. A tall, narrow vertical painting, 9:21 aspect ratio, opaque, filling the whole canvas edge to edge. It sits behind a column of cards and is darkened by the game, so it must read as a whole at a glance: one continuous route climbing from the bottom of the frame to the destination at the very top, no people in close-up (the three explorers may appear only as tiny figures on the route), quieter detail in the middle where cards lie over it. No border, no frame, no text, no lettering, no numbers, no watermark.
```

**`trail-yellow.png`** — Desert trail · 9:21 tall painting, opaque

```text
A single tall painting of the whole Desert route, read from the bottom up: at the bottom a Nile-side market and palms at the edge of the desert, a long stone causeway winding up through rolling amber dunes past the Great Sphinx, and at the very top the three Pyramids of Giza gleaming white with gilded capstones under Orion's Belt at dusk. Strongly led by amber gold, sun-bleached sand and burnt orange, with deep indigo night skies where it is night. A tall, narrow vertical painting, 9:21 aspect ratio, opaque, filling the whole canvas edge to edge. It sits behind a column of cards and is darkened by the game, so it must read as a whole at a glance: one continuous route climbing from the bottom of the frame to the destination at the very top, no people in close-up (the three explorers may appear only as tiny figures on the route), quieter detail in the middle where cards lie over it. No border, no frame, no text, no lettering, no numbers, no watermark.
```

**`trail-blue.png`** — Undersea trail · 9:21 tall painting, opaque

```text
A single tall painting of the whole Undersea route, read from the bottom up: at the bottom Alexandria's harbour at the waterline with the fortress on the point and a blue wooden dive boat, then down through deepening blue water past fallen granite blocks and a standing statue of Isis, and at the very top, framed as the goal, the sunlit columns and gilded doorway of Cleopatra's sunken palace. Strongly led by deep sea blue, teal and navy, with warm amber only where a lamp or the sun reaches. A tall, narrow vertical painting, 9:21 aspect ratio, opaque, filling the whole canvas edge to edge. It sits behind a column of cards and is darkened by the game, so it must read as a whole at a glance: one continuous route climbing from the bottom of the frame to the destination at the very top, no people in close-up (the three explorers may appear only as tiny figures on the route), quieter detail in the middle where cards lie over it. No border, no frame, no text, no lettering, no numbers, no watermark.
```

**`trail-white.png`** — Himalaya trail · 9:21 tall painting, opaque

```text
A single tall painting of the whole Himalaya route, read from the bottom up: at the bottom a misty valley village with a teahouse and prayer flags, a pilgrim path zigzagging up snowy slopes past a chorten and across a rope bridge over a gorge, and at the very top the Tiger's Nest's white walls and golden roofs clinging to the cliff above a sea of clouds. Strongly led by ice white, silver grey and cold blue, with warm gold only on the monastery roofs and in lamplight. A tall, narrow vertical painting, 9:21 aspect ratio, opaque, filling the whole canvas edge to edge. It sits behind a column of cards and is darkened by the game, so it must read as a whole at a glance: one continuous route climbing from the bottom of the frame to the destination at the very top, no people in close-up (the three explorers may appear only as tiny figures on the route), quieter detail in the middle where cards lie over it. No border, no frame, no text, no lettering, no numbers, no watermark.
```

**`trail-green.png`** — Rainforest trail · 9:21 tall painting, opaque

```text
A single tall painting of the whole Rainforest route, read from the bottom up: at the bottom a misty jungle lake with a dugout canoe, a white limestone causeway winding up through dense emerald forest past a root-wrapped stela and a jaguar on a branch, and at the very top the red temple pyramids and roof combs of the lost Maya city rising above the canopy in morning light. Strongly led by emerald and jungle green with mist, with warm limestone and red-painted stone only where the city shows. A tall, narrow vertical painting, 9:21 aspect ratio, opaque, filling the whole canvas edge to edge. It sits behind a column of cards and is darkened by the game, so it must read as a whole at a glance: one continuous route climbing from the bottom of the frame to the destination at the very top, no people in close-up (the three explorers may appear only as tiny figures on the route), quieter detail in the middle where cards lie over it. No border, no frame, no text, no lettering, no numbers, no watermark.
```

**`trail-red.png`** — Volcano trail · 9:21 tall painting, opaque

```text
A single tall painting of the whole Volcano route, read from the bottom up: at the bottom the Bay of Naples at sunset with a mule cart on the coast road, a Roman road with cart ruts climbing through grey ash fields and vineyards past an excavation tent, and at the very top the Forum of Pompeii and the Temple of Jupiter in its ancient glory beneath the double peak of Vesuvius trailing a plume of smoke. Strongly led by Pompeian red, ember orange and charcoal ash grey, with the cool blue of the bay where it shows. A tall, narrow vertical painting, 9:21 aspect ratio, opaque, filling the whole canvas edge to edge. It sits behind a column of cards and is darkened by the game, so it must read as a whole at a glance: one continuous route climbing from the bottom of the frame to the destination at the very top, no people in close-up (the three explorers may appear only as tiny figures on the route), quieter detail in the middle where cards lie over it. No border, no frame, no text, no lettering, no numbers, no watermark.
```

---

<a id="batch-12"></a>

## Batch 12 · Medallions and insignia (10) — pending

**Setup block** — paste first:

```text
Painterly digital illustration in the tradition of classic 1930s expedition adventure art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; cinematic depth with atmospheric haze and dramatic, warm-against-cool light; a sense of wonder and enormous scale, adventurous and inviting, never grim and never gory. The world is the 1930s: canvas, leather, brass, hurricane lamps, wooden boats and brass diving helmets; no modern equipment, no electronics, no plastic. No text, no lettering, no numbers, no signature, no watermark. This batch is the insignia of the Lost Cities board: small painted objects of a 1930s expedition, struck in aged brass and enamel, every one the same material, the same lighting from the upper left and the same scale within its square, so they read as one set. A single object centred on a fully transparent background, nothing else in the picture, no shadow on the ground, readable at 32 pixels wide. Square 1:1 aspect ratio. No text, no lettering, no numbers, no watermark.
```

**`medal-yellow.png`** — Desert medallion · 1:1, transparent

```text
A round expedition medallion of aged brass with a raised rim, its face in glossy amber gold enamel bearing a simple raised brass emblem: a sun disc over a small pyramid. The emblem is bold and simple, like a badge. A single object centred on a fully transparent background, nothing else in the picture, no shadow on the ground, readable at 32 pixels wide. Square 1:1 aspect ratio. No text, no lettering, no numbers, no watermark.
```

**`medal-blue.png`** — Undersea medallion · 1:1, transparent

```text
A round expedition medallion of aged brass with a raised rim, its face in glossy sea blue enamel bearing a simple raised brass emblem: a eight-pointed star over waves. The emblem is bold and simple, like a badge. A single object centred on a fully transparent background, nothing else in the picture, no shadow on the ground, readable at 32 pixels wide. Square 1:1 aspect ratio. No text, no lettering, no numbers, no watermark.
```

**`medal-white.png`** — Himalaya medallion · 1:1, transparent

```text
A round expedition medallion of aged brass with a raised rim, its face in glossy ice white and silver enamel bearing a simple raised brass emblem: a snow peak with a small golden roof. The emblem is bold and simple, like a badge. A single object centred on a fully transparent background, nothing else in the picture, no shadow on the ground, readable at 32 pixels wide. Square 1:1 aspect ratio. No text, no lettering, no numbers, no watermark.
```

**`medal-green.png`** — Rainforest medallion · 1:1, transparent

```text
A round expedition medallion of aged brass with a raised rim, its face in glossy emerald green enamel bearing a simple raised brass emblem: a leaf with a jaguar's eye. The emblem is bold and simple, like a badge. A single object centred on a fully transparent background, nothing else in the picture, no shadow on the ground, readable at 32 pixels wide. Square 1:1 aspect ratio. No text, no lettering, no numbers, no watermark.
```

**`medal-red.png`** — Volcano medallion · 1:1, transparent

```text
A round expedition medallion of aged brass with a raised rim, its face in glossy crimson and ember red enamel bearing a simple raised brass emblem: a flame over a volcano. The emblem is bold and simple, like a badge. A single object centred on a fully transparent background, nothing else in the picture, no shadow on the ground, readable at 32 pixels wide. Square 1:1 aspect ratio. No text, no lettering, no numbers, no watermark.
```

**`emblem-lost-cities.png`** — Game emblem · 1:1, transparent

```text
The emblem of the whole game: a brass compass rose laid over a small folded expedition map, the five compass points each enamelled in one expedition colour (amber gold, sea blue, ice white, emerald green, crimson). A single object centred on a fully transparent background, nothing else in the picture, no shadow on the ground, readable at 32 pixels wide. Square 1:1 aspect ratio. No text, no lettering, no numbers, no watermark.
```

**`icon-camp.png`** — Camp (discard piles) · 1:1, transparent

```text
A small canvas expedition tent with a hurricane lamp glowing at its open flap, struck as a brass-and-canvas badge. A single object centred on a fully transparent background, nothing else in the picture, no shadow on the ground, readable at 32 pixels wide. Square 1:1 aspect ratio. No text, no lettering, no numbers, no watermark.
```

**`icon-wager.png`** — Wager mark · 1:1, transparent

```text
Two hands clasped in a handshake over a single gold coin, struck as a brass badge, bold and simple. A single object centred on a fully transparent background, nothing else in the picture, no shadow on the ground, readable at 32 pixels wide. Square 1:1 aspect ratio. No text, no lettering, no numbers, no watermark.
```

**`seal-bonus.png`** — Long-expedition bonus seal · 1:1, transparent

```text
A round red wax seal pressed with a laurel wreath around a tiny brass compass, a short ribbon beneath it: the mark of a great expedition. A single object centred on a fully transparent background, nothing else in the picture, no shadow on the ground, readable at 32 pixels wide. Square 1:1 aspect ratio. No text, no lettering, no numbers, no watermark.
```

**`icon-deck.png`** — Deck · 1:1, transparent

```text
A small stack of expedition cards with a leather-bound journal cover on top, tied with a strap, brass corners. A single object centred on a fully transparent background, nothing else in the picture, no shadow on the ground, readable at 32 pixels wide. Square 1:1 aspect ratio. No text, no lettering, no numbers, no watermark.
```

---

<a id="batch-13"></a>

## Batch 13 · Card back (1) — pending

**Setup block** — paste first:

```text
Painterly digital illustration in the tradition of classic 1930s expedition adventure art: semi-realistic digital painting with soft, confident brushwork and crisp, readable silhouettes; cinematic depth with atmospheric haze and dramatic, warm-against-cool light; a sense of wonder and enormous scale, adventurous and inviting, never grim and never gory. The world is the 1930s: canvas, leather, brass, hurricane lamps, wooden boats and brass diving helmets; no modern equipment, no electronics, no plastic. No text, no lettering, no numbers, no signature, no watermark. This batch is the card back of the Lost Cities board, rich and dark so the game's light text stands out on it.
```

**`back.png`** — Card back · 2:3, opaque

```text
The back of an expedition card: dark tooled leather like a journal cover, with an embossed brass compass rose in the centre surrounded by a ring of five small enamel dots in amber gold, sea blue, ice white, emerald green and crimson, brass corner caps and a fine gilt border line. Portrait 2:3 aspect ratio, opaque, filling the whole canvas edge to edge, symmetrical, readable as a small thumbnail. No text, no lettering, no numbers, no watermark.
```

