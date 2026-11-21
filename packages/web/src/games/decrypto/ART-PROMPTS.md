# Decrypto Art

Everything the Wireless Room board paints: the two code screens and their windows, the digit and label plates, the tokens, trays and the nixie tube, the signal lamps, the brass code selectors, the teletype paper and the code card, the desk surfaces, the insignia and AI-tier crests, and the five debrief scenes. The board adds every keyword, digit, clue, name and count itself; the prompts generate **only pictures**.

Every file is a **PNG with a fully transparent background** unless its prompt says *opaque*. Drop the raw PNGs into `packages/web/art-src/decrypto/<name>.png` (gitignored; this file is the reproducible source). They are converted to `assets/art/*.webp` with `pnpm --filter @boardgames/web card-art --game=decrypto` per `assets/art/manifest.json`. The menu backdrop is not in this sheet: like every game's background it lives in the root `PROMPTS.md` ("Background Image Prompts", entry 17 · Decrypto, drawn with one ivory and one black screen to match this set) and is saved straight to `assets/background.png`.

---

**Status (2026-11-21):** 48 prompts in 8 batches of at most 10, all generated (raw PNGs in `art-src/decrypto/`, webp in `assets/art/`). A spot whose image is missing draws a CSS-material fallback. A batch heading says `— pending` while its images are not yet in `assets/art/`.

**How to use.** Work one batch at a time, in a fresh image-generator conversation:

1. Paste the batch's **setup block** first. It is the base style directive followed by the batch's own direction, so everything in the batch shares one look.
2. Then paste each item prompt of that batch in turn and save the result under the file name above it, in `packages/web/art-src/decrypto/`.

If your generator does not remember the conversation, put the setup block in front of every item prompt instead. Every item prompt repeats its own crop, background and aspect ratio, so it also works alone.

## Why the set is built this way

- **Parts, not a painted board.** The desk is laid out by code at fixed geometry and sized to the space left, as Codenames' grid is. A painted whole desk would put windows, wells and dials where the generator happens to draw them. So each object is its own image: the screen body is plain, and the windows, digit plates, wells and studs are separate pieces the board places exactly.
- **Blank faces.** Every plate, card, key, stamp and window is left empty. Keywords, digits 1–4, clues and labels are set in type by the board, so they stay sharp, translatable and correct.
- **One light, one era.** Every object is lit from the upper left by a warm desk lamp and belongs to one 1960s cipher room: bakelite, ivory plastic, brass, enamel, paper, red filter film and banker's-green felt. No digital displays anywhere. Nixie digits are drawn by the board over an empty tube.
- **Surfaces stay quiet.** The felt, bakelite and paper textures sit under text. They are dark or even, low in contrast and without focal points. The page background behind the desk stays the plain theme colour.
- **Debriefs follow the viewer.** Game over shows the scene for how the game ended *for the viewer*: we cracked their code, they garbled their own, they cracked ours, we garbled ours, or it went to points. No people or hands in any picture.

## Base style directive

Every setup block starts with this, verbatim:

> Painterly digital illustration of Cold War cipher-room equipment, in the same world as the Decrypto box art: semi-realistic painted props with soft, confident brushwork and crisp, readable silhouettes; a 1960s wireless and cipher room built from glossy black bakelite, ivory plastic, brushed and slightly tarnished brass, enamel, cream teletype paper, deep red filter film and dark banker's-green felt; warm desk-lamp light from the upper left with deep, cool shadows; tactile and lightly worn, hushed and tense, never cartoonish and never glossy-plastic modern. No modern electronics: no screens, no LEDs, no digital displays, no computers. No people, no hands. No text, no lettering, no numbers, no signature, no watermark.

**Palette words** (they become the board's `--dc-*` material tokens):

| Role | Colour |
| --- | --- |
| White team: ivory plastic | ivory #e8e0cc |
| Black team: bakelite | warm black #1c1915 |
| Brass | brushed brass #b8893f, tarnish #6e5226 |
| Red filter film (keyword windows) | deep red #8e1f1c, lit #c0392b |
| Teletype paper and cards | cream #efe6d2, typewriter ink #2a2622 |
| Desk felt | banker's green #143225, fading to near-black #0b1611 |
| Walnut frame | dark walnut #3b2618 |
| Nixie glow | amber #ffb347 |
| Lamps | emerald #3fbf7f, rose red #e0473a, amber #e8a33a |
| Interception token | white enamel #f1ece0 |
| Miscommunication token | black enamel #1a1714 |
| Theme accent (gold) | #c89b5e |

---

## Files

| File | Aspect ratio | Used on |
| --- | --- | --- |
| `screen-white.png`, `screen-black.png` | 5:1 | the body of each team's code screen; the board lays the windows and plates on it |
| `window-film.png`, `window-sealed.png` | 3:2 | a keyword window (yours, keyword in type on top) and Black's sealed window |
| `plate-digit.png`, `plate-label.png` | 4:3, 5:1 | the digit 1–4 above each window; engraved labels (team names, "Round") |
| `token-interception.png`, `token-miscommunication.png` | 1:1 | score chips in the trays, reveal drop, history markers |
| `tray-tokens.png`, `well-empty.png` | 2:1, 1:1 | each team's two-well tray; a single empty well |
| `lamp-green.png`, `lamp-red.png`, `lamp-amber.png`, `lamp-off.png` | 1:1 | per-slot ✓/✗ at the reveal, encrypting / waiting lamps on the operators |
| `nixie-tube.png` | 1:2 opaque | the round counter (digits drawn by the board) |
| `dial-plate.png`, `dial-knob.png`, `dial-stud.png` | 1:1 | the rotary code selector under each clue: plate, turning knob, four position studs |
| `key-cap.png` | 3:1 | the transmit / lock-in key (label in type) |
| `screw-head.png`, `bezel-ring.png` | 1:1 | desk corners; the ring around every operator's avatar |
| `tape-teletype.png`, `tape-torn-end.png` | 1:4 seamless, 4:1 | each window's hanging tape of past clues and its torn foot |
| `strip-teletype.png` | 8:1 seamless | the incoming transmission strip in the slot |
| `card-code.png`, `card-code-back.png` | 9:4 opaque | the encryptor's code card, front and back (flipped at the reveal); the "last" card |
| `paper-typing.png` | 1:1 opaque, seamless | the typing sheet the encryptor writes clues on |
| `stamp-red.png`, `stamp-green.png` | 3:1 | rubber-stamp frames for errors ("reused") and results ("intercepted", "decoded") |
| `tex-felt.png`, `tex-bakelite.png`, `tex-ivory.png`, `tex-brass.png`, `tex-walnut.png` | 1:1 opaque, seamless | desk inlay, Black's screen, White's screen, plates, desk frame |
| `band-desk-edge.png` | 8:1 seamless | the desk's front edge |
| `emblem-decrypto.png` | 1:1 | setup screen, rail header, debrief |
| `seal-white.png`, `seal-black.png` | 1:1 | team plaques, history, debrief |
| `crest-scout.png`, `crest-analyst.png`, `crest-mastermind.png` | 1:1 | AI operators' avatars and the setup screen's opponent picker |
| `icon-transmission.png`, `icon-timer.png` | 1:1 | history lines; the 30 s clue timer |
| `debrief-cracked.png`, `debrief-garbled.png`, `debrief-exposed.png`, `debrief-static.png`, `debrief-points.png` | 21:9 opaque | the game-over debrief header |

## Batches

| # | Batch | Prompts |
| --- | --- | --- |
| 01 | [Code screens](#batch-01) | 6 |
| 02 | [Tokens, trays and the nixie tube](#batch-02) | 5 |
| 03 | [Signal lamps](#batch-03) | 4 |
| 04 | [Brass controls](#batch-04) | 6 |
| 05 | [Paper: tapes, strip, code card and stamps](#batch-05) | 8 |
| 06 | [Desk surfaces](#batch-06) | 6 |
| 07 | [Insignia and operator crests](#batch-07) | 8 |
| 08 | [Debrief scenes](#batch-08) | 5 |
| | **Total** | **48** |

---

<a id="batch-01"></a>

## Batch 01 · Code screens (6)

**Setup block** — paste first:

```text
Painterly digital illustration of Cold War cipher-room equipment, in the same world as the Decrypto box art: semi-realistic painted props with soft, confident brushwork and crisp, readable silhouettes; a 1960s wireless and cipher room built from glossy black bakelite, ivory plastic, brushed and slightly tarnished brass, enamel, cream teletype paper, deep red filter film and dark banker's-green felt; warm desk-lamp light from the upper left with deep, cool shadows; tactile and lightly worn, hushed and tense, never cartoonish and never glossy-plastic modern. No modern electronics: no screens, no LEDs, no digital displays, no computers. No people, no hands. No text, no lettering, no numbers, no signature, no watermark. This batch is the parts of the two teams' code screens: the slim upright privacy screens each team hides its four secret keywords behind, as in the board game Decrypto. The game assembles each screen from these parts at exact positions, so every part is drawn alone, seen perfectly straight on from the front with no perspective, and left completely blank: no numbers, no words, no symbols on any face. One coherent set: the same straight-on view, the same warm light from the upper left, the same crisp outline. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark.
```

**`screen-white.png`** — 5:1 wide, transparent

```text
The front of the White team's code screen: a long, slim upright panel of ivory plastic (#e8e0cc), seen perfectly straight on, with softly chamfered edges, a thin raised lip along the top and a slightly heavier base, faint warm highlights along the top edge and a gentle shadowed bevel at the bottom. Its front face is one smooth, even, completely empty surface with no windows, no openings, no seams and no markings, because the game lays its own windows on it. The panel centred and filling about 96% of the width. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Wide composition, 5:1 aspect ratio.
```

**`screen-black.png`** — 5:1 wide, transparent

```text
The front of the Black team's code screen: a long, slim upright panel of glossy warm-black bakelite (#1c1915), seen perfectly straight on, with softly chamfered edges, a thin raised lip along the top and a slightly heavier base, a soft warm specular streak along the top edge from the lamp at the upper left and a deep shadowed bevel at the bottom. Its front face is one smooth, even, completely empty surface with no windows, no openings, no seams and no markings, because the game lays its own windows on it. The panel centred and filling about 96% of the width. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Wide composition, 5:1 aspect ratio.
```

**`window-film.png`** — 3:2, transparent

```text
One keyword window of a code screen, seen perfectly straight on: a rectangular opening with rounded inner corners, framed by a thin recessed bezel of brushed brass (#b8893f), glazed with a sheet of deep red translucent filter film (#8e1f1c) that glows a little brighter red (#c0392b) toward its centre as if a lamp shines through it from behind, with a faint vertical sheen and a few fine scratches. The film area is completely empty and even, with nothing behind it, because the game prints the keyword on top. The window centred and filling about 94% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Landscape composition, 3:2 aspect ratio.
```

**`window-sealed.png`** — 3:2, transparent

```text
One sealed keyword window of the enemy's code screen, seen perfectly straight on: a rectangular opening with rounded inner corners, framed by a thin recessed bezel of dark tarnished brass (#6e5226), glazed with very dark, almost black-red filter film (#3a0f0d) with no light behind it, a faint cold reflection across its top third, a few fine scratches; it hides whatever is behind it completely. The film area is empty and even. The window centred and filling about 94% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Landscape composition, 3:2 aspect ratio.
```

**`plate-digit.png`** — 4:3, transparent

```text
A small engraved name plate for a digit: a rounded rectangle of brushed brass (#b8893f) with bevelled edges, a tiny countersunk brass screw at its left and right ends, slight darker tarnish in the corners (#6e5226) and a warm highlight along the top bevel from the upper left. Its face is smooth and completely blank, because the game engraves the digit on it. Seen perfectly straight on, centred and filling about 92% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Landscape composition, 4:3 aspect ratio.
```

**`plate-label.png`** — 5:1 wide, transparent

```text
A long, thin engraved label plate: a narrow rounded rectangle of brushed brass (#b8893f) with bevelled edges, a tiny countersunk brass screw at each end, fine horizontal brushing marks, slight darker tarnish near the screws (#6e5226) and a warm highlight along the top bevel from the upper left. Its face is smooth and completely blank, because the game engraves the label on it. Seen perfectly straight on, centred and filling about 96% of the width. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Wide composition, 5:1 aspect ratio.
```

---

<a id="batch-02"></a>

## Batch 02 · Tokens, trays and the nixie tube (5)

**Setup block** — paste first:

```text
Painterly digital illustration of Cold War cipher-room equipment, in the same world as the Decrypto box art: semi-realistic painted props with soft, confident brushwork and crisp, readable silhouettes; a 1960s wireless and cipher room built from glossy black bakelite, ivory plastic, brushed and slightly tarnished brass, enamel, cream teletype paper, deep red filter film and dark banker's-green felt; warm desk-lamp light from the upper left with deep, cool shadows; tactile and lightly worn, hushed and tense, never cartoonish and never glossy-plastic modern. No modern electronics: no screens, no LEDs, no digital displays, no computers. No people, no hands. No text, no lettering, no numbers, no signature, no watermark. This batch is the small physical pieces that keep score on the desk: the white interception token, the black miscommunication token, the tray they rest in, a single empty well and an unlit nixie tube for the round counter. They must read as real objects at 24 to 40 px, so each is a simple, bold shape with a crisp outline. One coherent set: the same straight-on view from directly above or directly in front as each prompt says, the same warm light from the upper left. Each prompt names whether it is transparent or opaque, and its aspect ratio. No text, no lettering, no numbers, no watermark.
```

**`token-interception.png`** — 1:1 square, transparent

```text
A round interception token: a thick disc of white enamel over brass (#f1ece0), seen straight on from directly above, a thin polished brass rim, and in its centre a simple crosshair ring (a circle crossed by four short ticks) engraved shallowly and filled with faint grey. A crisp outline, a raised rim and a single warm highlight from the upper left. A physical game token, centred and filling about 88% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`token-miscommunication.png`** — 1:1 square, transparent

```text
A round miscommunication token: a thick disc of glossy black enamel over brass (#1a1714), seen straight on from directly above, a thin dull brass rim, and in its centre a short broken zigzag signal line (a radio wave snapped in the middle) engraved shallowly and filled with faint warm grey. A crisp outline, a raised rim and a single warm highlight from the upper left. A physical game token, centred and filling about 88% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`tray-tokens.png`** — 2:1 wide, transparent

```text
A small machined token tray seen straight on from directly above: a rounded rectangular block of warm-black bakelite (#1c1915) with a thin brushed brass rim (#b8893f), and two identical round wells sunk into it side by side, evenly spaced, each a smooth recessed cup with a soft inner shadow, both completely empty. The wells are sized for a round token filling them. Centred and filling about 94% of the width. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Wide composition, 2:1 aspect ratio.
```

**`well-empty.png`** — 1:1 square, transparent

```text
A single empty round well, seen straight on from directly above: a smooth recessed cup machined into warm-black bakelite (#1c1915), with a thin brushed brass collar (#b8893f) around its rim, a soft inner shadow deepest at the upper left and a faint warm reflection on the lower inner wall. Completely empty. Centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`nixie-tube.png`** — 1:2 tall, opaque

```text
A single unlit nixie tube seen straight on from the front against a near-black background (#0b0a09): a tall rounded glass envelope with a faint smoky tint and soft reflections, a fine hexagonal wire mesh just inside the glass, the stacked cathodes inside dark and indistinct so that no digit or shape can be read, a short black bakelite socket at the bottom with a thin brass ring, and a barely-there warm amber residual glow (#ffb347) at the base of the mesh. The tube centred and filling about 80% of the height. An opaque image filling the whole canvas edge to edge, no text, no lettering, no numbers, no visible digits, no border, no watermark. Tall composition, 1:2 aspect ratio.
```

---

<a id="batch-03"></a>

## Batch 03 · Signal lamps (4)

Four states of one lamp, in their own batch so nothing else pulls the look around. Generate `lamp-off.png` first. If your generator can edit an image, make each lit lamp by editing that one ("light this exact lamp from inside in green; change nothing else") rather than from scratch; otherwise paste the full prompts, which describe the same lamp word for word.

**Setup block** — paste first:

```text
Painterly digital illustration of Cold War cipher-room equipment, in the same world as the Decrypto box art: semi-realistic painted props with soft, confident brushwork and crisp, readable silhouettes; a 1960s wireless and cipher room built from glossy black bakelite, ivory plastic, brushed and slightly tarnished brass, enamel, cream teletype paper, deep red filter film and dark banker's-green felt; warm desk-lamp light from the upper left with deep, cool shadows; tactile and lightly worn, hushed and tense, never cartoonish and never glossy-plastic modern. No modern electronics: no screens, no LEDs, no digital displays, no computers. No people, no hands. No text, no lettering, no numbers, no signature, no watermark. This batch is four images of ONE signal lamp: the same jewel lamp unlit, lit green, lit red and lit amber. The game shows them side by side and swaps one for another when a lamp turns on, so all four must be pixel-for-pixel the same object in the same place: the same twelve-facet domed glass lens, the same knurled brass bezel, the same size, the same centring, the same straight-on front view, the same highlight on the bezel from the upper left. Nothing changes between them except the colour of the light inside the glass. No glow or halo outside the bezel; the game adds its own glow. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark.
```

**`lamp-off.png`** — 1:1 square, transparent

```text
Exactly the same lamp as every other lamp in this set, identical in shape, size, facets, bezel and position; only the light inside the glass differs. The lamp is one round jewel signal lamp from a 1960s cipher-room console, seen exactly straight on from the front: a domed glass lens cut into exactly twelve flat facets arranged around one smooth round facet in the middle, the lens taking up the inner two thirds of the lamp's diameter, held in a round brushed-brass bezel (#b8893f) with a finely knurled outer edge and a thin dark gap between bezel and lens. The bezel is lit by the warm desk lamp from the upper left, with one bright highlight at its upper-left edge. Unlit: the glass is dark smoky grey with no light inside, its facets catching only small cool reflections and one warm glint at the upper left. No glow, halo or light spill outside the bezel at all; the light stays inside the glass. The lamp perfectly centred and filling exactly 86% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`lamp-green.png`** — 1:1 square, transparent

```text
Exactly the same lamp as every other lamp in this set, identical in shape, size, facets, bezel and position; only the light inside the glass differs. The lamp is one round jewel signal lamp from a 1960s cipher-room console, seen exactly straight on from the front: a domed glass lens cut into exactly twelve flat facets arranged around one smooth round facet in the middle, the lens taking up the inner two thirds of the lamp's diameter, held in a round brushed-brass bezel (#b8893f) with a finely knurled outer edge and a thin dark gap between bezel and lens. The bezel is lit by the warm desk lamp from the upper left, with one bright highlight at its upper-left edge. Lit emerald green (#3fbf7f) from inside: the centre facet brightest, the twelve facets around it graded slightly darker toward the bezel, each facet edge catching a fine bright line. No glow, halo or light spill outside the bezel at all; the light stays inside the glass. The lamp perfectly centred and filling exactly 86% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`lamp-red.png`** — 1:1 square, transparent

```text
Exactly the same lamp as every other lamp in this set, identical in shape, size, facets, bezel and position; only the light inside the glass differs. The lamp is one round jewel signal lamp from a 1960s cipher-room console, seen exactly straight on from the front: a domed glass lens cut into exactly twelve flat facets arranged around one smooth round facet in the middle, the lens taking up the inner two thirds of the lamp's diameter, held in a round brushed-brass bezel (#b8893f) with a finely knurled outer edge and a thin dark gap between bezel and lens. The bezel is lit by the warm desk lamp from the upper left, with one bright highlight at its upper-left edge. Lit rose red (#e0473a) from inside: the centre facet brightest, the twelve facets around it graded slightly darker toward the bezel, each facet edge catching a fine bright line. No glow, halo or light spill outside the bezel at all; the light stays inside the glass. The lamp perfectly centred and filling exactly 86% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`lamp-amber.png`** — 1:1 square, transparent

```text
Exactly the same lamp as every other lamp in this set, identical in shape, size, facets, bezel and position; only the light inside the glass differs. The lamp is one round jewel signal lamp from a 1960s cipher-room console, seen exactly straight on from the front: a domed glass lens cut into exactly twelve flat facets arranged around one smooth round facet in the middle, the lens taking up the inner two thirds of the lamp's diameter, held in a round brushed-brass bezel (#b8893f) with a finely knurled outer edge and a thin dark gap between bezel and lens. The bezel is lit by the warm desk lamp from the upper left, with one bright highlight at its upper-left edge. Lit warm amber (#e8a33a) from inside: the centre facet brightest, the twelve facets around it graded slightly darker toward the bezel, each facet edge catching a fine bright line. No glow, halo or light spill outside the bezel at all; the light stays inside the glass. The lamp perfectly centred and filling exactly 86% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-04"></a>

## Batch 04 · Brass controls (6)

**Setup block** — paste first:

```text
Painterly digital illustration of Cold War cipher-room equipment, in the same world as the Decrypto box art: semi-realistic painted props with soft, confident brushwork and crisp, readable silhouettes; a 1960s wireless and cipher room built from glossy black bakelite, ivory plastic, brushed and slightly tarnished brass, enamel, cream teletype paper, deep red filter film and dark banker's-green felt; warm desk-lamp light from the upper left with deep, cool shadows; tactile and lightly worn, hushed and tense, never cartoonish and never glossy-plastic modern. No modern electronics: no screens, no LEDs, no digital displays, no computers. No people, no hands. No text, no lettering, no numbers, no signature, no watermark. This batch is the brass controls a player touches: the rotary code selector that sets one digit of a guess (a round plate, a turning knob and the studs that mark its four positions, each drawn separately because the game assembles and turns them), the key that transmits an answer, the screws on the desk corners and the brass ring that frames each operator's portrait. Every piece is seen straight on from directly above, so it can be rotated without its lighting looking wrong, except where a prompt says otherwise. One coherent set in the same brushed brass (#b8893f) with darker tarnish (#6e5226) in the recesses. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark.
```

**`dial-plate.png`** — 1:1 square, transparent

```text
The round base plate of a rotary selector, seen straight on from directly above: a flat disc of brushed brass (#b8893f) with fine concentric turning marks, a slightly raised outer rim, darker tarnish in the groove inside the rim (#6e5226), and a plain dark round recess at the very centre where a knob sits. No markings, no ticks, no numbers on it, because the game places its own position studs. Centred and filling about 94% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`dial-knob.png`** — 1:1 square, transparent

```text
The turning knob of a rotary selector, seen straight on from directly above: a round, fluted black bakelite knob (#1c1915) with a domed top, a polished brass cap in its centre (#b8893f), and a single slim ivory pointer line (#e8e0cc) inlaid from the centre straight up to the top edge, pointing exactly at twelve o'clock. Even lighting with only a soft highlight on the dome, so it still looks right when the game rotates it. Centred and filling about 80% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`dial-stud.png`** — 1:1 square, transparent

```text
A single round position stud for a selector dial, seen straight on from directly above: a small domed button of polished brass (#b8893f) on a thin darker brass collar (#6e5226), with one soft highlight, its face smooth and completely blank because the game engraves the digit on it. Centred and filling about 86% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`key-cap.png`** — 3:1 wide, transparent

```text
A wide transmit key cap seen straight on from the front: a long rounded-rectangle push key of warm ivory bakelite (#e8e0cc) with a slightly concave top face, sitting in a thin brushed brass surround (#b8893f), a soft warm highlight along its upper edge and a shadowed lower bevel, its face smooth and completely blank because the game prints the label on it. Centred and filling about 94% of the width. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Wide composition, 3:1 aspect ratio.
```

**`screw-head.png`** — 1:1 square, transparent

```text
A single slotted brass screw head seen straight on from directly above: a small round domed head of brushed brass (#b8893f) with one straight slot across it set at a slight diagonal, darker tarnish in the slot (#6e5226), one warm highlight. Centred and filling about 80% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`bezel-ring.png`** — 1:1 square, transparent

```text
A round knurled brass bezel ring seen straight on from the front, like the rim of a gauge: an even ring of brushed brass (#b8893f) with fine knurling on its outer edge and a thin bevel on its inner edge catching light from the upper left; the inside of the ring is completely empty and transparent, because the game shows a portrait through it. The ring centred and filling about 94% of the canvas, its width about one tenth of the diameter. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-05"></a>

## Batch 05 · Paper: tapes, strip, code card and stamps (8)

**Setup block** — paste first:

```text
Painterly digital illustration of Cold War cipher-room equipment, in the same world as the Decrypto box art: semi-realistic painted props with soft, confident brushwork and crisp, readable silhouettes; a 1960s wireless and cipher room built from glossy black bakelite, ivory plastic, brushed and slightly tarnished brass, enamel, cream teletype paper, deep red filter film and dark banker's-green felt; warm desk-lamp light from the upper left with deep, cool shadows; tactile and lightly worn, hushed and tense, never cartoonish and never glossy-plastic modern. No modern electronics: no screens, no LEDs, no digital displays, no computers. No people, no hands. No text, no lettering, no numbers, no signature, no watermark. This batch is the paper of the cipher room: teletype tape that hangs below each keyword window, the incoming transmission strip, the encryptor's code card, the typing sheet and two rubber-stamp frames. The game types every clue, digit and word onto this paper itself, so every piece of paper is completely blank, clean enough to carry small dark type, in one cream paper (#efe6d2) with faint fibres and the softest ageing. Seen perfectly flat and straight on. Each prompt names whether it is transparent, opaque or seamless, and its aspect ratio. No text, no lettering, no numbers, no watermark.
```

**`tape-teletype.png`** — 1:4 tall, transparent, seamless top to bottom

```text
A vertical length of narrow teletype paper tape seen perfectly flat and straight on: cream paper (#efe6d2) with faint fibres, a single row of small round sprocket perforations running down its left edge, a very slight soft curl shadow along the right edge, otherwise clean and completely blank. It repeats seamlessly from top to bottom: the top and bottom edges match exactly, with no tear, no end and no feature that would show at a seam. The tape fills about 92% of the width and runs the full height. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Tall composition, 1:4 aspect ratio.
```

**`tape-torn-end.png`** — 4:1 wide, transparent

```text
The torn bottom end of a narrow teletype paper tape, seen perfectly flat and straight on: a short piece of cream paper (#efe6d2) the same width as the tape filling the canvas width, with the round sprocket perforations along its left edge, ending at the bottom in a ragged, slightly curling torn edge with a few loose fibres. The top edge is clean and straight so it joins the tape above. Completely blank paper. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Wide composition, 4:1 aspect ratio.
```

**`strip-teletype.png`** — 8:1 wide, transparent, seamless left to right

```text
A horizontal length of teletype paper strip seen perfectly flat and straight on: cream paper (#efe6d2) with faint fibres, a single row of small round sprocket perforations running along its top edge and another along its bottom edge, otherwise clean and completely blank, with the faintest freshness of newly printed paper. It repeats seamlessly from left to right: the left and right edges match exactly, with no tear and no end. The strip fills about 90% of the height and runs the full width. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Wide composition, 8:1 aspect ratio.
```

**`card-code.png`** — 9:4 wide, opaque

```text
The face of a punched code card seen perfectly flat and straight on, filling the whole canvas: stiff cream card stock (#efe6d2) with the top-left corner cut off at an angle, a thin printed border of fine deep red rules (#8e1f1c) inset from the edge, and three large empty rectangular boxes in a row across the middle outlined in the same fine red rule, where the game types the code's three digits; a short row of small rectangular punched holes along the top edge. Clean, crisp, lightly handled. An opaque image filling the whole canvas edge to edge, no text, no lettering, no numbers, no watermark. Wide composition, 9:4 aspect ratio.
```

**`card-code-back.png`** — 9:4 wide, opaque

```text
The back of a punched code card seen perfectly flat and straight on, filling the whole canvas: stiff card printed in deep banker's green (#143225) with a fine, even guilloche pattern of interlaced lines in slightly lighter green, a thin cream border inset from the edge (#efe6d2), the top-right corner cut off at an angle (the mirror of the face), and in the centre a small cream cipher-wheel emblem of two concentric rings with evenly spaced ticks and no characters. An opaque image filling the whole canvas edge to edge, no text, no lettering, no numbers, no watermark. Wide composition, 9:4 aspect ratio.
```

**`paper-typing.png`** — 1:1 square, opaque, seamless

```text
A seamless tileable texture of typewriter paper: cream paper (#efe6d2) with very faint fibres and the softest uneven tone, perfectly even overall, low in contrast, no stains, no folds, no lines and no focal point, clean enough to carry small dark typewritten text. A seamless tileable tile: opposite edges match exactly so it repeats with no visible seam, no large single feature. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no watermark. Square composition, 1:1 aspect ratio.
```

**`stamp-red.png`** — 3:1 wide, transparent

```text
An empty rubber-stamp frame printed in red ink (#c0392b) on nothing: a rectangular double-line border with slightly rounded corners, the ink uneven and grainy as from a real rubber stamp pressed a little crooked, a few gaps where the ink did not take; the inside of the frame is completely empty and transparent, because the game stamps its own word inside. Tilted about three degrees. Centred and filling about 92% of the width. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Wide composition, 3:1 aspect ratio.
```

**`stamp-green.png`** — 3:1 wide, transparent

```text
An empty rubber-stamp frame printed in green ink (#2f9a63) on nothing: a rectangular double-line border with slightly rounded corners, the ink uneven and grainy as from a real rubber stamp pressed a little crooked, a few gaps where the ink did not take; the inside of the frame is completely empty and transparent, because the game stamps its own word inside. Tilted about three degrees the other way. Centred and filling about 92% of the width. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Wide composition, 3:1 aspect ratio.
```

---

<a id="batch-06"></a>

## Batch 06 · Desk surfaces (6)

**Setup block** — paste first:

```text
Painterly digital illustration of Cold War cipher-room equipment, in the same world as the Decrypto box art: semi-realistic painted props with soft, confident brushwork and crisp, readable silhouettes; a 1960s wireless and cipher room built from glossy black bakelite, ivory plastic, brushed and slightly tarnished brass, enamel, cream teletype paper, deep red filter film and dark banker's-green felt; warm desk-lamp light from the upper left with deep, cool shadows; tactile and lightly worn, hushed and tense, never cartoonish and never glossy-plastic modern. No modern electronics: no screens, no LEDs, no digital displays, no computers. No people, no hands. No text, no lettering, no numbers, no signature, no watermark. This batch is the surfaces the desk and its objects are made of: the felt inlay, black bakelite, ivory plastic, brushed brass, the walnut frame and the desk's front edge. Text, tapes and screens sit on top of them, so every surface is quiet, even and low in contrast, with no focal point, no objects, no vignette and no light pool, and the felt is dark enough for cream paper and brass to stand out on it. Each prompt names whether it is seamless, and its aspect ratio. No text, no lettering, no numbers, no watermark.
```

**`tex-felt.png`** — 1:1 square, opaque, seamless

```text
A seamless tileable texture of dark banker's-green desk felt (#143225, leaning toward near-black #0b1611): fine short wool fibres, a very faint woven nap, perfectly even tone with no light pool, no worn patches, no stains and no focal point, very low in contrast. A seamless tileable tile: opposite edges match exactly so it repeats with no visible seam, no large single feature. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no watermark. Square composition, 1:1 aspect ratio.
```

**`tex-bakelite.png`** — 1:1 square, opaque, seamless

```text
A seamless tileable texture of glossy warm-black bakelite (#1c1915): a smooth moulded surface with the faintest swirl of darker and lighter brown-black in the resin, a few microscopic pores, perfectly even overall, no reflections of objects, no highlights that would show a light source, very low in contrast. A seamless tileable tile: opposite edges match exactly so it repeats with no visible seam, no large single feature. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no watermark. Square composition, 1:1 aspect ratio.
```

**`tex-ivory.png`** — 1:1 square, opaque, seamless

```text
A seamless tileable texture of aged ivory plastic (#e8e0cc): a smooth, faintly satin surface with the softest mottling of warmer and cooler cream, a few microscopic flecks, perfectly even overall, no highlights that would show a light source, low in contrast. A seamless tileable tile: opposite edges match exactly so it repeats with no visible seam, no large single feature. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no watermark. Square composition, 1:1 aspect ratio.
```

**`tex-brass.png`** — 1:1 square, opaque, seamless

```text
A seamless tileable texture of brushed brass (#b8893f): fine straight horizontal brushing lines across the whole surface, the faintest patches of warmer and duller tarnish (#6e5226), perfectly even overall, no highlights that would show a light source, low in contrast. A seamless tileable tile: opposite edges match exactly so it repeats with no visible seam, no large single feature. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no watermark. Square composition, 1:1 aspect ratio.
```

**`tex-walnut.png`** — 1:1 square, opaque, seamless

```text
A seamless tileable texture of dark oiled walnut (#3b2618): straight, fine, closely spaced grain running left to right, a soft satin finish, an even dark tone with gentle variation, no knots, no planks, no joins and no focal point, low in contrast. A seamless tileable tile: opposite edges match exactly so it repeats with no visible seam, no large single feature. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no watermark. Square composition, 1:1 aspect ratio.
```

**`band-desk-edge.png`** — 8:1 wide, transparent, seamless left to right

```text
A horizontal band for the front edge of a cipher desk, seen straight on: a rounded strip of dark oiled walnut (#3b2618) with a thin inlaid line of brushed brass (#b8893f) running along its upper edge, a soft warm highlight on the rounded top and a darker underside. It repeats seamlessly from left to right: the left and right edges match exactly, with no ends and no fittings. The band fills about 90% of the height. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Wide composition, 8:1 aspect ratio.
```

---

<a id="batch-07"></a>

## Batch 07 · Insignia and operator crests (8)

**Setup block** — paste first:

```text
Painterly digital illustration of Cold War cipher-room equipment, in the same world as the Decrypto box art: semi-realistic painted props with soft, confident brushwork and crisp, readable silhouettes; a 1960s wireless and cipher room built from glossy black bakelite, ivory plastic, brushed and slightly tarnished brass, enamel, cream teletype paper, deep red filter film and dark banker's-green felt; warm desk-lamp light from the upper left with deep, cool shadows; tactile and lightly worn, hushed and tense, never cartoonish and never glossy-plastic modern. No modern electronics: no screens, no LEDs, no digital displays, no computers. No people, no hands. No text, no lettering, no numbers, no signature, no watermark. This batch is one matched set of round enamel badges, like the insignia on a signals unit's equipment: the game emblem, the two team seals, the three AI operator crests (the opponent tiers Scout, Analyst and Mastermind, from least to most dangerous) and two small icons. Every badge is built the same way: a perfectly round disc seen straight on, a polished brass rim (#b8893f) of the same thickness on every one, an enamel field in the colour its prompt names with a faint radial sheen, and one simple emblem raised in brass relief in the middle, filling about half of the field, bold enough to read at 24 px. The same light from the upper left on all, the same size, the same rim. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark.
```

**`emblem-decrypto.png`** — 1:1 square, transparent

```text
The emblem: a slim code screen seen from the front with four small rectangular windows in a row, and above it a short arc of three radio waves rising from its centre. A round badge: a polished brass rim (#b8893f), a deep red enamel field (#8e1f1c), the emblem in raised brass relief in the centre. The badge centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`seal-white.png`** — 1:1 square, transparent

```text
The emblem: a simple upright radio mast with a small spark at its tip, standing on a short base line. A round badge: a polished brass rim (#b8893f), an ivory-white enamel field (#e8e0cc), the emblem in raised brass relief in the centre. The badge centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`seal-black.png`** — 1:1 square, transparent

```text
The emblem: a simple upright radio mast with a small spark at its tip, standing on a short base line, identical to the White seal so the two read as rivals of one kind. A round badge: a polished brass rim (#b8893f), a glossy black enamel field (#1a1714), the emblem in raised brass relief in the centre. The badge centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`crest-scout.png`** — 1:1 square, transparent

```text
The emblem: a pair of headphones with a single short sound wave beside one earcup, simple and light, for the least dangerous AI operator, the Scout. A round badge: a polished brass rim (#b8893f), a muted slate-blue enamel field (#4a5a6e), the emblem in raised brass relief in the centre. The badge centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`crest-analyst.png`** — 1:1 square, transparent

```text
The emblem: a magnifying loupe held over a short length of perforated tape, for the middle AI operator, the Analyst. A round badge: a polished brass rim (#b8893f), a deep banker's-green enamel field (#1f4a36), the emblem in raised brass relief in the centre. The badge centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`crest-mastermind.png`** — 1:1 square, transparent

```text
The emblem: a cipher wheel of two concentric rings with evenly spaced ticks and no characters, with a single sharp key laid diagonally across it, for the most dangerous AI operator, the Mastermind. A round badge: a polished brass rim (#b8893f), a deep oxblood enamel field (#5a1416), the emblem in raised brass relief in the centre, a little more ornate than the other two crests. The badge centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-transmission.png`** — 1:1 square, transparent

```text
The emblem: a small antenna tower sending out three curved radio waves to the right. A round badge: a polished brass rim (#b8893f), a dark warm-black enamel field (#1c1915), the emblem in raised brass relief in the centre, extra bold so it reads at 16 px. The badge centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

**`icon-timer.png`** — 1:1 square, transparent

```text
The emblem: a mechanical stopwatch with a winding crown on top and a single hand, its face plain with no numerals. A round badge: a polished brass rim (#b8893f), a dark warm-black enamel field (#1c1915), the emblem in raised brass relief in the centre, extra bold so it reads at 16 px. The badge centred and filling about 90% of the canvas. Isolated on a fully transparent background, no cast shadow, no text, no lettering, no numbers, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-08"></a>

## Batch 08 · Debrief scenes (5)

**Setup block** — paste first:

```text
Painterly digital illustration of Cold War cipher-room equipment, in the same world as the Decrypto box art: semi-realistic painted props with soft, confident brushwork and crisp, readable silhouettes; a 1960s wireless and cipher room built from glossy black bakelite, ivory plastic, brushed and slightly tarnished brass, enamel, cream teletype paper, deep red filter film and dark banker's-green felt; warm desk-lamp light from the upper left with deep, cool shadows; tactile and lightly worn, hushed and tense, never cartoonish and never glossy-plastic modern. No modern electronics: no screens, no LEDs, no digital displays, no computers. No people, no hands. No text, no lettering, no numbers, no signature, no watermark. This batch is the wide header paintings of the game-over debrief, one for each way a game can end for the player looking at it. They are cinematic still lifes of the cipher desk at the moment the game ends, with no people and no hands anywhere: the objects tell the story. The debrief headers carry a headline in their left third, so each keeps its left third dark and calm and puts its story right of centre. One coherent set: the same desk, the same green banker's lamp, the same two code screens (ivory for White, black bakelite for Black), the same painterly finish; only the moment and the light change. An opaque image filling the whole canvas edge to edge, no text, no lettering, no readable words, codes or numbers, no border, no frame, no watermark.
```

**`debrief-cracked.png`** — 21:9 panorama, opaque

```text
Victory by interception: a cipher desk at night under a green banker's lamp, right of centre a long strip of teletype paper curling off the desk with its marks blurred beyond reading, a punched code card lying face up beside it, and two white enamel interception tokens resting in a brass tray, lit warmly. Behind them, the enemy's black bakelite code screen stands with its four red windows glowing open, its secret exposed. Quiet triumph: warm brass and amber light pushing back the dark green shadows. The left third of the picture stays dark and calm. An opaque image filling the whole canvas edge to edge, no text, no lettering, no readable words, codes or numbers, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`debrief-garbled.png`** — 21:9 panorama, opaque

```text
Victory because the enemy garbled its own code: a cipher desk at night under a green banker's lamp, right of centre the enemy's black bakelite code screen in disarray, its torn teletype tapes tangled in a heap on the desk, two black enamel miscommunication tokens resting in its brass tray, a red jewel lamp lit beside it. In the near foreground the ivory screen stands calm and untouched in warm light. Wry, quiet satisfaction: warm light on the ivory side, cold red on the black side. The left third of the picture stays dark and calm. An opaque image filling the whole canvas edge to edge, no text, no lettering, no readable words, codes or numbers, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`debrief-exposed.png`** — 21:9 panorama, opaque

```text
Defeat by interception: a cipher desk at night, the green banker's lamp knocked slightly askew, right of centre the ivory code screen with its four red windows lit and laid bare, a long teletype strip running away off the far edge of the desk into the dark as if pulled toward the enemy, and two white interception tokens sitting on the black side of the desk. Cold blue light from a rain-streaked window falls across the scene and a single red jewel lamp glows. Tense, sombre, compromised. The left third of the picture stays dark and calm. An opaque image filling the whole canvas edge to edge, no text, no lettering, no readable words, codes or numbers, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`debrief-static.png`** — 21:9 panorama, opaque

```text
Defeat because our own messages were misread: a cipher desk at night under a dimmed green banker's lamp, right of centre the ivory code screen with its paper tapes snapped and drifting loose, a pair of headphones lying unplugged with their cord coiled, two black miscommunication tokens in the ivory side's brass tray, and a faint grey haze of static light from a dark radio set at the back. Melancholy and muted: greys and dull greens, one small amber glow left. The left third of the picture stays dark and calm. An opaque image filling the whole canvas edge to edge, no text, no lettering, no readable words, codes or numbers, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```

**`debrief-points.png`** — 21:9 panorama, opaque

```text
A game decided on points after the last round, or shared: a cipher desk at dawn, right of centre the ivory and the black bakelite code screens standing face to face at either end of the desk, an equal spread of white and black enamel tokens between them, the green banker's lamp still on but outshone by pale grey-gold morning light through a window, the night's teletype tapes lying in long even curls. Calm, balanced, the end of a long night. The left third of the picture stays dark and calm. An opaque image filling the whole canvas edge to edge, no text, no lettering, no readable words, codes or numbers, no border, no frame, no watermark. Wide panorama, 21:9 aspect ratio.
```
