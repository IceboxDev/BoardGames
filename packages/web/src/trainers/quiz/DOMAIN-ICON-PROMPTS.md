# Quiz Domain Icons

The quiz trainer's 14 domains (`packages/core/src/quiz/taxonomy.ts`) get an icon each, and **the icon is designed for the concept it lives in**, not one set for all: each redesign concept (Quiz Trainer Redesign Studio, https://claude.ai/artifact/G6w9nndVwxQjN1AGXrH5ks) uses its icons at different sizes, on different backgrounds and beside different type.

| Concept | Where the icons sit | Sizes | Icon style | Generated? |
| --- | --- | --- | --- | --- |
| 1 · Ember Ledger | domain tiles, article rows, card header, session list, on warm rounded panels | 16–40 px | [enamel pins](#set-pin) | yes, 14 |
| 2 · Reading Room | section kickers, briefs, the sections index, on dark newsprint | 20–40 px | [printer's cuts](#set-cut) | yes, 14 |
| 3 · Cockpit | the dense domain rail and queue rows, beside monospace | 16–28 px | [line glyphs drawn in code](#glyphs) | no |
| 4 · Daily Deck | deck fronts on dark stock and the cream deck face | 20–40 px | [suit pips](#set-pip) | yes, 14 |
| 5 · The Thread | the nodes on the thread line and the side rail | 16–40 px | [line glyphs drawn in code](#glyphs) | no |

**Generate only the set of the concept you pick**: the other sets stay here as the record of why each concept would look the way it does.

Every domain keeps **its own colour** across all sets (it becomes the domain's colour in the trainer, replacing today's 8 shared colours):

| Slug | Domain | Colour |
| --- | --- | --- |
| `music-stage` | Music & Stage | crimson red (#e0505f) |
| `literature` | Literature & Words | royal violet (#8a64e0) |
| `art` | Art, Architecture & Design | coral orange (#e8794a) |
| `film-media` | Film & Television | warm gold (#e5c84a) |
| `sport-games` | Sport & Games | lime green (#a3c43e) |
| `belief` | Religion, Myth & Philosophy | deep purple (#b05fd6) |
| `everyday` | Everyday Life & Pop Culture | hot pink (#ec6fa8) |
| `history` | History | amber ochre (#d9a03a) |
| `society` | Politics, Law & Economy | steel blue-grey (#7d93b0) |
| `science` | Science & Medicine | bright cyan (#3fb3cf) |
| `earth-space` | Physics, Earth & Space | ultramarine blue (#5468e0) |
| `nature` | Animals & Plants | leaf green (#4fae5e) |
| `technology` | Technology & Video Games | mint teal (#3dbf9a) |
| `geography` | Countries, Peoples & Languages | azure blue (#4a93e0) |

Every generated file is a **PNG with a fully transparent background**, square. Save raw PNGs as `packages/web/art-src/quiz-domains/<set>-<slug>.png` (`pin-…`, `cut-…`, `pip-…`; gitignored, these prompts are the reproducible source). The conversion to webp (`card-art`) gets a `quiz-domains` target when the chosen set is wired in.

**How to use a set.** Two batches of seven, one fresh image-generator conversation per batch. Paste the batch's setup block, then the item prompts in order, saving each result under the file name above it. For the second batch, attach one finished image from the first as the style reference before its setup block. Every item prompt repeats the style, colour, background and aspect ratio, so it also works alone.

---

<a id="set-pin"></a>

## Set 1 · Enamel pins — for Concept 1, Ember Ledger

Ember Ledger is a warm, calm product UI: rounded panels on `#1f1c19`, Inter type, a gold accent (#c89b5e). Its icons sit in the 14 domain tiles (40 px), the article rows and the card header (28 px) and the end-of-session list (16 px). A hard-enamel collector's pin matches it: a rounded-square badge echoing the panels' corners, gold line work picking up the accent, flat glossy colour that stays clean at 16 px.

**Base style directive** (starts every setup block):

> Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour this prompt names fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio.

### Batch pin-A (7) · Music & Stage, Literature & Words, Art, Architecture & Design, Film & Television, Sport & Games, Religion, Myth & Philosophy, Everyday Life & Pop Culture

**Setup block** — paste first:

```text
Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour this prompt names fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio. This batch is a set of 7 sibling pins for one quiz app: identical badge shape, size, corner radius, gold outline weight and camera on every pin; only the field colour and the central motif change. I will describe each one in turn; reply to each with one image.
```

**`pin-music-stage.png`** — Music & Stage

```text
Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour crimson red (#e0505f) fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio. The motif: a gramophone horn with two beamed eighth notes rising from it. It stands for the quiz category "Music & Stage" — do not write that name anywhere.
```

**`pin-literature.png`** — Literature & Words

```text
Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour royal violet (#8a64e0) fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio. The motif: an open book with a quill pen laid across its pages. It stands for the quiz category "Literature & Words" — do not write that name anywhere.
```

**`pin-art.png`** — Art, Architecture & Design

```text
Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour coral orange (#e8794a) fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio. The motif: a painter's palette with a single paintbrush. It stands for the quiz category "Art, Architecture & Design" — do not write that name anywhere.
```

**`pin-film-media.png`** — Film & Television

```text
Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour warm gold (#e5c84a) fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio. The motif: a clapperboard, its striped top half open. It stands for the quiz category "Film & Television" — do not write that name anywhere.
```

**`pin-sport-games.png`** — Sport & Games

```text
Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour lime green (#a3c43e) fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio. The motif: a two-handled trophy cup with a small star on its body. It stands for the quiz category "Sport & Games" — do not write that name anywhere.
```

**`pin-belief.png`** — Religion, Myth & Philosophy

```text
Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour deep purple (#b05fd6) fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio. The motif: a wise owl seen from the front, wings folded. It stands for the quiz category "Religion, Myth & Philosophy" — do not write that name anywhere.
```

**`pin-everyday.png`** — Everyday Life & Pop Culture

```text
Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour hot pink (#ec6fa8) fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio. The motif: a striped popcorn box overflowing with popcorn. It stands for the quiz category "Everyday Life & Pop Culture" — do not write that name anywhere.
```

### Batch pin-B (7) · History, Politics, Law & Economy, Science & Medicine, Physics, Earth & Space, Animals & Plants, Technology & Video Games, Countries, Peoples & Languages

**Setup block** — paste first:

```text
Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour this prompt names fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio. This batch is a set of 7 sibling pins for one quiz app: identical badge shape, size, corner radius, gold outline weight and camera on every pin; only the field colour and the central motif change. I will describe each one in turn; reply to each with one image.
```

**`pin-history.png`** — History

```text
Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour amber ochre (#d9a03a) fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio. The motif: an hourglass with sand running. It stands for the quiz category "History" — do not write that name anywhere.
```

**`pin-society.png`** — Politics, Law & Economy

```text
Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour steel blue-grey (#7d93b0) fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio. The motif: a pair of balance scales. It stands for the quiz category "Politics, Law & Economy" — do not write that name anywhere.
```

**`pin-science.png`** — Science & Medicine

```text
Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour bright cyan (#3fb3cf) fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio. The motif: a conical laboratory flask with three bubbles rising. It stands for the quiz category "Science & Medicine" — do not write that name anywhere.
```

**`pin-earth-space.png`** — Physics, Earth & Space

```text
Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour ultramarine blue (#5468e0) fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio. The motif: a ringed planet with one small star beside it. It stands for the quiz category "Physics, Earth & Space" — do not write that name anywhere.
```

**`pin-nature.png`** — Animals & Plants

```text
Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour leaf green (#4fae5e) fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio. The motif: a broad leaf with a ladybird on it. It stands for the quiz category "Animals & Plants" — do not write that name anywhere.
```

**`pin-technology.png`** — Technology & Video Games

```text
Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour mint teal (#3dbf9a) fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio. The motif: a light bulb whose screw base is a cog wheel. It stands for the quiz category "Technology & Video Games" — do not write that name anywhere.
```

**`pin-geography.png`** — Countries, Peoples & Languages

```text
Premium hard-enamel collector's pin, photographed straight on: a rounded-square badge with softly rounded corners, its outline and all line work in raised polished gold metal (#d8b06a), the cells filled with flat glossy enamel. The colour azure blue (#4a93e0) fills the badge's background field; the single motif in the middle is drawn in gold line work with cream (#f3ead8) and a darker shade of the field colour as its only other enamel colours. Bold, simple, flat shapes with thick gold outlines, no gradients inside a cell, no tiny details, so the pin reads clearly at 16 pixels; a soft highlight sheen across the enamel. No text, letters or numbers; no signature or watermark. Fully transparent background, no cast shadow, no pin back visible. The badge is centred and fills about 90 percent of the canvas. Square 1:1 aspect ratio. The motif: a globe on a curved stand. It stands for the quiz category "Countries, Peoples & Languages" — do not write that name anywhere.
```

---

<a id="set-cut"></a>

## Set 2 · Printer's cuts — for Concept 2, Reading Room (the newspaper)

The Reading Room is a full newspaper: blackletter nameplate, Playfair headlines, Source Serif body, column rules and double rules on dark newsprint (`#1a1713`), cream ink (#ece4d6). Its icons stand beside the small-caps section kicker (20–28 px), head the briefs (40 px) and run down the "Inside · 14 sections" index (20 px). Anything glossy or painted would look pasted in; what belongs on that page is a printer's cut — the little wood-engraved vignettes that headed newspaper sections in the 1890s, printed in the paper's cream ink with one flat spot colour, like a two-colour press run.

**Base style directive** (starts every setup block):

> Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — the colour this prompt names — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio.

### Batch cut-A (7) · Music & Stage, Literature & Words, Art, Architecture & Design, Film & Television, Sport & Games, Religion, Myth & Philosophy, Everyday Life & Pop Culture

**Setup block** — paste first:

```text
Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — the colour this prompt names — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio. This batch is a set of 7 sibling section cuts for one newspaper: identical circular border, line weight, hatching density, ink colour and print offset on every cut; only the motif and its spot colour change. I will describe each one in turn; reply to each with one image.
```

**`cut-music-stage.png`** — Music & Stage

```text
Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — crimson red (#e0505f) — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio. The motif: a classical lyre with a ribbon tied at its base. It stands for the quiz category "Music & Stage" — do not write that name anywhere.
```

**`cut-literature.png`** — Literature & Words

```text
Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — royal violet (#8a64e0) — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio. The motif: a quill pen standing in an inkwell. It stands for the quiz category "Literature & Words" — do not write that name anywhere.
```

**`cut-art.png`** — Art, Architecture & Design

```text
Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — coral orange (#e8794a) — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio. The motif: an artist's palette with two brushes through its thumb hole. It stands for the quiz category "Art, Architecture & Design" — do not write that name anywhere.
```

**`cut-film-media.png`** — Film & Television

```text
Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — warm gold (#e5c84a) — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio. The motif: a hand-cranked cinema camera on a wooden tripod. It stands for the quiz category "Film & Television" — do not write that name anywhere.
```

**`cut-sport-games.png`** — Sport & Games

```text
Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — lime green (#a3c43e) — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio. The motif: a laurel wreath around a leather football. It stands for the quiz category "Sport & Games" — do not write that name anywhere.
```

**`cut-belief.png`** — Religion, Myth & Philosophy

```text
Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — deep purple (#b05fd6) — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio. The motif: an owl perched on a closed book. It stands for the quiz category "Religion, Myth & Philosophy" — do not write that name anywhere.
```

**`cut-everyday.png`** — Everyday Life & Pop Culture

```text
Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — hot pink (#ec6fa8) — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio. The motif: a teacup on a saucer with curling steam. It stands for the quiz category "Everyday Life & Pop Culture" — do not write that name anywhere.
```

### Batch cut-B (7) · History, Politics, Law & Economy, Science & Medicine, Physics, Earth & Space, Animals & Plants, Technology & Video Games, Countries, Peoples & Languages

**Setup block** — paste first:

```text
Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — the colour this prompt names — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio. This batch is a set of 7 sibling section cuts for one newspaper: identical circular border, line weight, hatching density, ink colour and print offset on every cut; only the motif and its spot colour change. I will describe each one in turn; reply to each with one image.
```

**`cut-history.png`** — History

```text
Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — amber ochre (#d9a03a) — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio. The motif: a winged hourglass. It stands for the quiz category "History" — do not write that name anywhere.
```

**`cut-society.png`** — Politics, Law & Economy

```text
Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — steel blue-grey (#7d93b0) — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio. The motif: scales of justice hanging from a beam. It stands for the quiz category "Politics, Law & Economy" — do not write that name anywhere.
```

**`cut-science.png`** — Science & Medicine

```text
Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — bright cyan (#3fb3cf) — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio. The motif: a brass microscope. It stands for the quiz category "Science & Medicine" — do not write that name anywhere.
```

**`cut-earth-space.png`** — Physics, Earth & Space

```text
Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — ultramarine blue (#5468e0) — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio. The motif: an armillary sphere on a short stand. It stands for the quiz category "Physics, Earth & Space" — do not write that name anywhere.
```

**`cut-nature.png`** — Animals & Plants

```text
Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — leaf green (#4fae5e) — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio. The motif: a stag beetle on an oak leaf. It stands for the quiz category "Animals & Plants" — do not write that name anywhere.
```

**`cut-technology.png`** — Technology & Video Games

```text
Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — mint teal (#3dbf9a) — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio. The motif: two interlocking cogwheels with a small spark between them. It stands for the quiz category "Technology & Video Games" — do not write that name anywhere.
```

**`cut-geography.png`** — Countries, Peoples & Languages

```text
Antique newspaper printer's cut: a small circular wood-engraving vignette in the style of an 1890s broadsheet section emblem, drawn with confident engraved line work and cross-hatching in cream ink (#ece4d6) only, plus ONE flat spot colour — azure blue (#4a93e0) — printed as a solid tint filling one or two areas of the motif, slightly offset from the line work like a real two-colour press. A bold engraved outer contour and a thin double-ruled circular border hold the vignette together. Strong contrast and a heavy enough line that the motif still reads at 24 pixels; no fine text, no banners with lettering. No letters, words or numbers anywhere; no signature or watermark. Fully transparent background, nothing outside the circular border. Centred, the border filling about 92 percent of the canvas. Square 1:1 aspect ratio. The motif: a globe in a wooden meridian stand. It stands for the quiz category "Countries, Peoples & Languages" — do not write that name anywhere.
```

---

<a id="set-pip"></a>

## Set 3 · Suit pips — for Concept 4, Daily Deck

Daily Deck treats every article as a physical deck of cards: Fraunces type, deck fronts on dark card stock (`#231e19`) with the domain colour as the deck's edge, and the article's face printed on cream card (`#f1e9dc`). The icons are the deck's suit: 40 px at the top of each deck, 20–28 px on the cream face and the cards. A suit pip does that job — a bold solid silhouette like ♠ ♥ ♦ ♣, in the domain colour, with a thin bright gold foil edge so it holds up on both the dark stock and the cream face.

**Base style directive** (starts every setup block):

> Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in the colour this prompt names, like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio.

### Batch pip-A (7) · Music & Stage, Literature & Words, Art, Architecture & Design, Film & Television, Sport & Games, Religion, Myth & Philosophy, Everyday Life & Pop Culture

**Setup block** — paste first:

```text
Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in the colour this prompt names, like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio. This batch is a set of 7 sibling suit pips for one card game: identical size, outline weight, foil edge and emboss on every pip; only the silhouette and its colour change. I will describe each one in turn; reply to each with one image.
```

**`pip-music-stage.png`** — Music & Stage

```text
Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in crimson red (#e0505f), like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio. The motif: an eighth note. It stands for the quiz category "Music & Stage" — do not write that name anywhere.
```

**`pip-literature.png`** — Literature & Words

```text
Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in royal violet (#8a64e0), like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio. The motif: a feather quill, tip pointing down. It stands for the quiz category "Literature & Words" — do not write that name anywhere.
```

**`pip-art.png`** — Art, Architecture & Design

```text
Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in coral orange (#e8794a), like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio. The motif: a painter's palette. It stands for the quiz category "Art, Architecture & Design" — do not write that name anywhere.
```

**`pip-film-media.png`** — Film & Television

```text
Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in warm gold (#e5c84a), like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio. The motif: a clapperboard. It stands for the quiz category "Film & Television" — do not write that name anywhere.
```

**`pip-sport-games.png`** — Sport & Games

```text
Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in lime green (#a3c43e), like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio. The motif: a trophy cup. It stands for the quiz category "Sport & Games" — do not write that name anywhere.
```

**`pip-belief.png`** — Religion, Myth & Philosophy

```text
Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in deep purple (#b05fd6), like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio. The motif: an owl's head seen from the front. It stands for the quiz category "Religion, Myth & Philosophy" — do not write that name anywhere.
```

**`pip-everyday.png`** — Everyday Life & Pop Culture

```text
Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in hot pink (#ec6fa8), like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio. The motif: a teacup on a saucer. It stands for the quiz category "Everyday Life & Pop Culture" — do not write that name anywhere.
```

### Batch pip-B (7) · History, Politics, Law & Economy, Science & Medicine, Physics, Earth & Space, Animals & Plants, Technology & Video Games, Countries, Peoples & Languages

**Setup block** — paste first:

```text
Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in the colour this prompt names, like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio. This batch is a set of 7 sibling suit pips for one card game: identical size, outline weight, foil edge and emboss on every pip; only the silhouette and its colour change. I will describe each one in turn; reply to each with one image.
```

**`pip-history.png`** — History

```text
Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in amber ochre (#d9a03a), like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio. The motif: an hourglass. It stands for the quiz category "History" — do not write that name anywhere.
```

**`pip-society.png`** — Politics, Law & Economy

```text
Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in steel blue-grey (#7d93b0), like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio. The motif: balance scales. It stands for the quiz category "Politics, Law & Economy" — do not write that name anywhere.
```

**`pip-science.png`** — Science & Medicine

```text
Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in bright cyan (#3fb3cf), like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio. The motif: a conical flask. It stands for the quiz category "Science & Medicine" — do not write that name anywhere.
```

**`pip-earth-space.png`** — Physics, Earth & Space

```text
Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in ultramarine blue (#5468e0), like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio. The motif: a ringed planet. It stands for the quiz category "Physics, Earth & Space" — do not write that name anywhere.
```

**`pip-nature.png`** — Animals & Plants

```text
Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in leaf green (#4fae5e), like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio. The motif: a leaf. It stands for the quiz category "Animals & Plants" — do not write that name anywhere.
```

**`pip-technology.png`** — Technology & Video Games

```text
Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in mint teal (#3dbf9a), like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio. The motif: a cog wheel. It stands for the quiz category "Technology & Video Games" — do not write that name anywhere.
```

**`pip-geography.png`** — Countries, Peoples & Languages

```text
Deluxe playing-card suit pip: ONE bold, solid silhouette symbol in azure blue (#4a93e0), like a custom card suit beside spades and hearts, with a thin bright gold foil edge (#e8c47a) tracing its outline and a gentle emboss so it looks stamped into card stock. Flat, simple and as symmetrical as the shape allows; no inner detail beyond one or two cut-out lines; no gradient beyond the soft emboss. It must read instantly at 20 pixels on both a near-black card (#231e19) and a cream card (#f1e9dc). No letters, words or numbers; no signature or watermark. Fully transparent background, no shadow, no card behind it. Centred, filling about 80 percent of the canvas. Square 1:1 aspect ratio. The motif: an eight-pointed compass star. It stands for the quiz category "Countries, Peoples & Languages" — do not write that name anywhere.
```

---

<a id="glyphs"></a>

## Line glyphs drawn in code — for Concept 3, Cockpit, and Concept 5, The Thread

No image generation. Cockpit is a dense, monospace instrument panel and The Thread a minimal Geist page whose structure is a line of nodes; both show their icons at 16–20 px most of the time, where a painted image turns into a blur and any texture fights the type. They get a 14-glyph SVG set drawn alongside the app's existing hand-drawn icons (`packages/web/src/components/icons`): 24 × 24 grid, 1.75 px round-capped stroke in `currentColor` (the domain colour), no fills, optical size checked at 16 px. In The Thread each glyph sits inside the node ring on the thread line; in Cockpit it sits bare at the start of a row.

| Slug | Glyph |
| --- | --- |
| `music-stage` | eighth note |
| `literature` | feather quill |
| `art` | palette |
| `film-media` | clapperboard |
| `sport-games` | trophy |
| `belief` | owl (front) |
| `everyday` | teacup |
| `history` | hourglass |
| `society` | balance scales |
| `science` | conical flask |
| `earth-space` | ringed planet |
| `nature` | leaf |
| `technology` | cog |
| `geography` | compass star |
