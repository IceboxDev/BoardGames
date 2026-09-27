# The Hunger Card Art

The Hunger's cards, Vampires and player boards are **composed, not drawn**: every face is
assembled by the UI from a small set of shared blocks on one 2:3 design grid — a
tone backdrop, the figure, a tone-coloured frame, Speed and VP badges, a row of keyword
icons and the rules text. Because the blocks share one directive, one palette and one
set of composition rules, the game is coherent by construction. The prompts below
generate **only the blocks** — no card borders, numbers, names or rules text; the UI
adds those.

Every block is a **PNG with a fully transparent background** unless the prompt says
*opaque*. Drop the raw PNGs into `packages/web/art-src/hunger-cards/<name>.png`
(gitignored — the prompts here are the reproducible source, and `*.png` is LFS-tracked).
The converter and compositor are a follow-up: `scripts/optimize-card-art.mjs` gains a
`--game=hunger` target that trims, shrinks and writes `assets/cards/*.webp`.

---

**Status (2026-09-26):** 215 prompts in 24 batches of at most 10. No art generated yet — start with the **style-lock batch** at the end.

**How to use.** Work one batch at a time, in a fresh image-generator conversation:

1. Paste the batch's **setup block** first. It is the base style directive followed by the batch's own directive, so everything in the batch shares one look.
2. Then paste each item prompt of that batch in turn and save the result under the file name above it, in `packages/web/art-src/hunger-cards/`.

If your generator does not remember the conversation, put the setup block in front of every item prompt instead.

## Base style directive

Every setup block starts with this, verbatim:

> Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds.

**Palette words** (they match `logic/card-colors.ts` `TONE_HEX` and the seat colours):

| Role | Colour |
| --- | --- |
| Villager | bone white #e7e5e4 (drawn as unbleached linen so it reads on cream) |
| Religious | candle yellow #facc15 |
| Military | regimental red #ef4444 |
| Noble | royal blue #60a5fa |
| Familiar | violet #a78bfa |
| Power / Starting | emerald #34d399 |
| Rose | rose crimson #fb7185 |
| Blood (VP, collars) | dark blood red #9b111e |
| Ink | sepia-black #2a1f1a |
| Seat 0 Rajesh | emerald #27ae60 |
| Seat 1 Boris | sapphire #2e86de |
| Seat 2 Josephine | yellow #f1c40f |
| Seat 3 Beatrice | violet #8e44ad |
| Seat 4 Yoko | crimson #c0392b |
| Seat 5 Gervasi | amber #e67e22 |

**Setting:** a Carpathian / Mitteleuropa village, c. 1840–1880 — the Humans' names are
Hungarian, Romanian, French and English, and their costumes follow that period.

---

## Files

| File | Aspect ratio | Block | Used on |
| --- | --- | --- | --- |
| `vampire-{seat}-bust.png` ×6 | 4:5 | waist-up portrait | rail, avatars, game-over |
| `vampire-{seat}-full.png` ×6 | 2:3 | full figure | player board, game-over hero |
| `vampire-{seat}-sigil.png` ×6 | 1:1 | seat crest | Starting-deck back, map token, board header |
| `human-{id}.png` ×80 | 4:5 | waist-up Human | Human cards |
| `familiar-{beast}.png` ×10 | 1:1 | full-body beast | Familiar cards (one per effect) |
| `power-{art}.png` ×7 | 4:5 | vignette | Power cards |
| `rose-{art}.png` ×3 | 4:5 | still life | Rose cards |
| `starting-{art}.png` ×4 | 4:5 | vignette | Starting cards |
| `backdrop-{tone}.png` ×7 | 4:5 opaque | soft scene | behind every figure |
| `icon-{name}.png` ×67 | 1:1 | ink stamp | badges, keywords, map, Missions, tokens |
| `back-hunt-pattern.png` | 1:1 seamless | bats and moons | Hunt-deck back |
| `back-hunt-emblem.png` | 1:1 | castle roundel | Hunt-deck back |
| `mission-frame-standard.png` | 1:1 opaque | beige parchment tile | Standard Missions |
| `mission-frame-instant.png` | 1:1 opaque | gilded parchment tile | Instant Missions |
| `mission-back.png` | 1:1 | wax-sealed scroll | Mission backs, Crypt piles |
| `bonus-token-disc.png` | 1:1 | blank brass disc | Bonus tokens |
| `bonus-token-back.png` | 1:1 | face-down disc | hidden Chests |
| `castle-tile.png` | 1:1 | blank stone plaque | Castle tiles |
| `board-wood.png` | 1:1 seamless opaque | mahogany | player board |
| `board-corner.png` | 1:1 | brass coffin corner | player board |
| `zone-deck.png` / `zone-discard.png` / `zone-digestion.png` | 1:1 | zone emblems | player board |
| `hunt-track-mat.png` | 3:2 opaque | market-stall board | Hunt Track |
| `tavern-sign.png` | 4:3 | hanging sign | Tavern |
| `sunrise-backdrop.png` | 16:9 opaque | dawn over the castle | game-over screen |
| `paper-grain.png` | 1:1 seamless | cold-press fibres | every face |
| `ink-splatter.png` | 1:1 | ink spatter overlay | frames, badges |
| `frame-ornament.png` | 1:1 | gothic corner | card frame |

### Shared art (card id → file)

Every Human has its own picture (`human-<id>`). Cards that share an effect or a name share one picture:

| Card ids | File |
| --- | --- |
| `nanny`, `capra` | `familiar-goat.png` |
| `echo`, `bo`, `gray`, `jahda` | `familiar-wolf.png` |
| `tyson`, `porumbel` | `familiar-pigeon.png` |
| `kutya`, `caine` | `familiar-dog.png` |
| `chop`, `malac` | `familiar-pig.png` |
| `sova`, `bagoly` | `familiar-owl.png` |
| `wee-vlad`, `patcani` | `familiar-rat.png` |
| `wiggles`, `kaa` | `familiar-snake.png` |
| `ursa`, `teddy` | `familiar-bear.png` |
| `lockjaw`, `nanoosh` | `familiar-panther.png` |
| `vampiric-will`, `vampiric-will-double` | `power-vampiric-will.png` |
| `vampiric-strength`, `vampiric-strength-great` | `power-vampiric-strength.png` |
| `vampiric-speed-2`, `vampiric-speed-3` | `power-vampiric-speed.png` |
| `eternal-rose` / `dead-rose` / `perfect-rose` | `rose-eternal.png` / `rose-dead.png` / `rose-perfect.png` |
| `s-the-hunger` | `starting-the-hunger.png` |
| `vampire-speed-2`, `vampire-speed-3`, `vampire-speed-4` | `starting-vampire-speed.png` |
| `vampire-thirst` | `starting-vampire-thirst.png` |
| `s-vampire-strength` | `starting-vampire-strength.png` |

## Batches

| # | Batch | Prompts |
| --- | --- | --- |
| 01 | [Vampire portraits](#batch-01) | 6 |
| 02 | [Vampire full figures](#batch-02) | 6 |
| 03 | [Seals and emblems](#batch-03) | 8 |
| 04 | [Nobles I — the lean and the minor](#batch-04) | 10 |
| 05 | [Nobles II — the well-fed](#batch-05) | 10 |
| 06 | [Religious I — the humble](#batch-06) | 10 |
| 07 | [Religious II — the high clergy](#batch-07) | 10 |
| 08 | [Villagers I — children and the poor](#batch-08) | 10 |
| 09 | [Villagers II — tradesfolk](#batch-09) | 10 |
| 10 | [Military I — the rank and file](#batch-10) | 10 |
| 11 | [Military II — officers and duellists](#batch-11) | 10 |
| 12 | [Familiars](#batch-12) | 10 |
| 13 | [Powers](#batch-13) | 7 |
| 14 | [Relics and still lifes](#batch-14) | 10 |
| 15 | [Scenes and backgrounds](#batch-15) | 9 |
| 16 | [Icons I — card stats](#batch-16) | 10 |
| 17 | [Icons II — keywords](#batch-17) | 10 |
| 18 | [Icons III — factions and card kinds](#batch-18) | 10 |
| 19 | [Icons IV — the land](#batch-19) | 10 |
| 20 | [Icons V — places](#batch-20) | 10 |
| 21 | [Icons VI — Mission logic](#batch-21) | 10 |
| 22 | [Icons VII — treasure and time](#batch-22) | 7 |
| 23 | [Surfaces and textures](#batch-23) | 6 |
| 24 | [Fittings and tokens](#batch-24) | 6 |
| 25 | [Icons — regeneration](#batch-25) | 5 |
| | **Total** | **215** + 5 redos |

---

<a id="batch-01"></a>

## Batch 01 · Vampire portraits (6)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is the six player Vampires as waist-up portraits — one coherent set, like six portraits from the same gallery. Each is an elegant Victorian vampire, pale with a faint grey-violet undertone to the skin whatever their complexion, small sharp fangs, a faint red glint in the eyes, a knowing, predatory half-smile; elegant predators, never monstrous. Identical crop, pose and lighting across the set: half body from the waist up, facing three-quarters left, looking at the viewer, cool moonlight from the upper left. Their seat colour, named in each prompt, is the only saturated colour on them. Portrait composition, 4:5 aspect ratio, the figure cut cleanly at the waist along the bottom edge. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark.
```

**`vampire-rajesh-bust.png`** — 4:5 portrait

```text
A Victorian vampire, Rajesh Amara: an old, gaunt, skinny African man with a close-cropped white beard and receding white hair, an emerald velvet frock coat over a high-collared black waistcoat, long-nailed hands folded over a silver-topped ebony cane. The only saturated colour is emerald green (#27ae60). Half body from the waist up, facing three-quarters left, looking at the viewer with a knowing, predatory half-smile, pale skin with a faint grey-violet undertone, small sharp fangs, the figure cut cleanly at the waist along the bottom edge. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`vampire-boris-bust.png`** — 4:5 portrait

```text
A Victorian vampire, Boris Pouchkine: an old, fat Slavic count with a magnificent grey handlebar moustache and bushy brows, a sapphire-blue greatcoat with a fur collar straining at its brass buttons, a ribbon of old medals. The only saturated colour is sapphire blue (#2e86de). Half body from the waist up, facing three-quarters left, looking at the viewer with a knowing, predatory half-smile, pale skin with a faint grey-violet undertone, small sharp fangs, the figure cut cleanly at the waist along the bottom edge. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`vampire-josephine-bust.png`** — 4:5 portrait

```text
A Victorian vampire, Josephine Lafayette: a young, slender African woman with her hair piled high in an elegant updo, a golden-yellow Empire-waist silk gown with long gloves, a cameo choker, an amused smile showing the tip of a fang. The only saturated colour is golden yellow (#f1c40f). Half body from the waist up, facing three-quarters left, looking at the viewer with a knowing, predatory half-smile, pale skin with a faint grey-violet undertone, small sharp fangs, the figure cut cleanly at the waist along the bottom edge. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`vampire-beatrice-bust.png`** — 4:5 portrait

```text
A Victorian vampire, Lady Beatrice: a thin, middle-aged Victorian widow with severe dark hair in a chignon, a violet mourning dress with a high lace collar and jet-bead jewellery, a black lace fan. The only saturated colour is deep violet (#8e44ad). Half body from the waist up, facing three-quarters left, looking at the viewer with a knowing, predatory half-smile, pale skin with a faint grey-violet undertone, small sharp fangs, the figure cut cleanly at the waist along the bottom edge. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`vampire-yoko-bust.png`** — 4:5 portrait

```text
A Victorian vampire, Yoko Chiyako: a young, slender Japanese woman with glossy black hair in a Meiji-era updo held by a kanzashi hairpin, a crimson silk kimono under a lace-trimmed Western capelet, lace gloves. The only saturated colour is crimson (#c0392b). Half body from the waist up, facing three-quarters left, looking at the viewer with a knowing, predatory half-smile, pale skin with a faint grey-violet undertone, small sharp fangs, the figure cut cleanly at the waist along the bottom edge. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`vampire-gervasi-bust.png`** — 4:5 portrait

```text
A Victorian vampire, Don Gervasi: a slim, middle-aged Italian nobleman with slicked-back black hair greying at the temples and a pencil moustache, an amber brocade waistcoat under a black opera cape, a heavy signet ring. The only saturated colour is amber orange (#e67e22). Half body from the waist up, facing three-quarters left, looking at the viewer with a knowing, predatory half-smile, pale skin with a faint grey-violet undertone, small sharp fangs, the figure cut cleanly at the waist along the bottom edge. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

---

<a id="batch-02"></a>

## Batch 02 · Vampire full figures (6)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is the same six player Vampires, now standing full-length — keep each face, costume and seat colour exactly as in their portrait. Each is pale with a faint grey-violet undertone to the skin, small sharp fangs, a faint red glint in the eyes. Identical scale across the set: full figure standing, three-quarters left, head near the top edge and feet near the bottom edge, the cloak or hem spreading slightly at the feet, cool moonlight from the upper left. Their seat colour is the only saturated colour on them. Portrait composition, 2:3 aspect ratio. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark.
```

**`vampire-rajesh-full.png`** — 2:3 portrait

```text
A Victorian vampire, Rajesh Amara: an old, gaunt, skinny African man with a close-cropped white beard and receding white hair, an emerald velvet frock coat over a high-collared black waistcoat, long-nailed hands folded over a silver-topped ebony cane, full figure standing, three-quarters left, leaning on the cane, one hand raised as if about to make a point. The only saturated colour is emerald green (#27ae60). Full figure standing, three-quarters left, pale skin with a faint grey-violet undertone, small sharp fangs, head near the top edge and feet near the bottom edge, the cloak or hem spreading slightly at the feet. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`vampire-boris-full.png`** — 2:3 portrait

```text
A Victorian vampire, Boris Pouchkine: an old, fat Slavic count with a magnificent grey handlebar moustache and bushy brows, a sapphire-blue greatcoat with a fur collar straining at its brass buttons, a ribbon of old medals, full figure standing, three-quarters left, hands on his great belly, chin up, amused. The only saturated colour is sapphire blue (#2e86de). Full figure standing, three-quarters left, pale skin with a faint grey-violet undertone, small sharp fangs, head near the top edge and feet near the bottom edge, the cloak or hem spreading slightly at the feet. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`vampire-josephine-full.png`** — 2:3 portrait

```text
A Victorian vampire, Josephine Lafayette: a young, slender African woman with her hair piled high in an elegant updo, a golden-yellow Empire-waist silk gown with long gloves, a cameo choker, an amused smile showing the tip of a fang, full figure standing, three-quarters left, twirling a closed fan, weight on one hip. The only saturated colour is golden yellow (#f1c40f). Full figure standing, three-quarters left, pale skin with a faint grey-violet undertone, small sharp fangs, head near the top edge and feet near the bottom edge, the cloak or hem spreading slightly at the feet. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`vampire-beatrice-full.png`** — 2:3 portrait

```text
A Victorian vampire, Lady Beatrice: a thin, middle-aged Victorian widow with severe dark hair in a chignon, a violet mourning dress with a high lace collar and jet-bead jewellery, a black lace fan, full figure standing, three-quarters left, upright and still, hands clasped before her, fan hanging from the wrist. The only saturated colour is deep violet (#8e44ad). Full figure standing, three-quarters left, pale skin with a faint grey-violet undertone, small sharp fangs, head near the top edge and feet near the bottom edge, the cloak or hem spreading slightly at the feet. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`vampire-yoko-full.png`** — 2:3 portrait

```text
A Victorian vampire, Yoko Chiyako: a young, slender Japanese woman with glossy black hair in a Meiji-era updo held by a kanzashi hairpin, a crimson silk kimono under a lace-trimmed Western capelet, lace gloves, full figure standing, three-quarters left, one gloved hand lifting the hem, turning as if caught mid-step. The only saturated colour is crimson (#c0392b). Full figure standing, three-quarters left, pale skin with a faint grey-violet undertone, small sharp fangs, head near the top edge and feet near the bottom edge, the cloak or hem spreading slightly at the feet. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

**`vampire-gervasi-full.png`** — 2:3 portrait

```text
A Victorian vampire, Don Gervasi: a slim, middle-aged Italian nobleman with slicked-back black hair greying at the temples and a pencil moustache, an amber brocade waistcoat under a black opera cape, a heavy signet ring, full figure standing, three-quarters left, a small bow, one hand sweeping the cape open. The only saturated colour is amber orange (#e67e22). Full figure standing, three-quarters left, pale skin with a faint grey-violet undertone, small sharp fangs, head near the top edge and feet near the bottom edge, the cloak or hem spreading slightly at the feet. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 2:3 aspect ratio.
```

---

<a id="batch-03"></a>

## Batch 03 · Seals and emblems (8)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is heraldry: round seals and emblems that must read as bold silhouettes at 24 px — engraved wax-seal and coin-die style, thick confident outlines, flat colour fills, minimal hatching. Each emblem is centred and fills the canvas. Square composition. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark.
```

**`vampire-rajesh-sigil.png`** — 1:1 square

```text
A heraldic roundel crest in the style of an engraved wax seal: a coiled serpent wound around an hourglass inside a thin double ring, drawn in sepia-black ink with the emblem filled in flat emerald green (#27ae60). The roundel filling the canvas. A bold silhouette that reads at 24 px, centred, filling the canvas. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`vampire-boris-sigil.png`** — 1:1 square

```text
A heraldic roundel crest in the style of an engraved wax seal: a bat wearing a crown of frost crystals inside a thin double ring, drawn in sepia-black ink with the emblem filled in flat sapphire blue (#2e86de). The roundel filling the canvas. A bold silhouette that reads at 24 px, centred, filling the canvas. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`vampire-josephine-sigil.png`** — 1:1 square

```text
A heraldic roundel crest in the style of an engraved wax seal: a sun eclipsed by a spread-winged bat inside a thin double ring, drawn in sepia-black ink with the emblem filled in flat golden yellow (#f1c40f). The roundel filling the canvas. A bold silhouette that reads at 24 px, centred, filling the canvas. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`vampire-beatrice-sigil.png`** — 1:1 square

```text
A heraldic roundel crest in the style of an engraved wax seal: a single rose crossed with an old iron key inside a thin double ring, drawn in sepia-black ink with the emblem filled in flat deep violet (#8e44ad). The roundel filling the canvas. A bold silhouette that reads at 24 px, centred, filling the canvas. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`vampire-yoko-sigil.png`** — 1:1 square

```text
A heraldic roundel crest in the style of an engraved wax seal: a moth with spread wings inside a thin double ring, drawn in sepia-black ink with the emblem filled in flat crimson (#c0392b). The roundel filling the canvas. A bold silhouette that reads at 24 px, centred, filling the canvas. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`vampire-gervasi-sigil.png`** — 1:1 square

```text
A heraldic roundel crest in the style of an engraved wax seal: a Venetian half-mask pierced by a slim dagger inside a thin double ring, drawn in sepia-black ink with the emblem filled in flat amber orange (#e67e22). The roundel filling the canvas. A bold silhouette that reads at 24 px, centred, filling the canvas. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`back-hunt-emblem.png`** — 1:1 square

```text
A round emblem: a gothic castle silhouette on a crag under a huge full moon, a single bat crossing the moon, inside a thin double ring with small thorns, sepia-black ink with the moon in pale bone and a dark blood-red (#9b111e) ring. The roundel filling the canvas. A bold silhouette that reads at 24 px, centred, filling the canvas. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`mission-back.png`** — 1:1 square

```text
A rolled parchment scroll sealed with a dark blood-red (#9b111e) wax seal stamped with a bat, lying diagonally. A bold silhouette that reads at 24 px, centred, filling the canvas. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-04"></a>

## Batch 04 · Nobles I — the lean and the minor (10)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is ten Noble Humans — the vampires' prey, villagers of an 1840s–1880s Carpathian village who have no idea a vampire is watching; expressive storybook faces. Minor gentry, gamblers, dowagers and eccentrics: thinner, fussier and a little shabby. Identical crop, pose and lighting across the set, and the same as every other Human batch: half body from the waist up, facing three-quarters left, cool moonlight from the upper left. The Noble colour is royal blue (#60a5fa): it appears on one sash, ribbon, bow or jewel and nowhere else — it is the only saturated colour. How appetising each Human looks is named in the prompt: pallid and scrawny, ordinary, or plump and rosy-cheeked. Portrait composition, 4:5 aspect ratio, the figure cut cleanly at the waist along the bottom edge. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark.
```

**`human-mindy.png`** — 4:5 portrait

```text
A thin, nervous debutante wringing a lace handkerchief, a limp royal-blue ribbon in her hair. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-agnes.png`** — 4:5 portrait

```text
A frail elderly dowager peering through a lorgnette, a shawl over bony shoulders, a royal-blue cameo. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-veres.png`** — 4:5 portrait

```text
A gaunt noble genealogist unrolling a long family-tree scroll of tiny noble portraits, a royal-blue ribbon on the scroll. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-jack.png`** — 4:5 portrait

```text
A rakish gentleman gambler with a sly grin, playing cards peeking from his waistcoat pocket, a royal-blue cravat pin. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-wilma.png`** — 4:5 portrait

```text
A salon hostess laughing mid-chatter, one hand raised and waving, the other holding a champagne coupe, a royal-blue ribbon choker. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-wadsworth.png`** — 4:5 portrait

```text
A vastly rotund lord leaning heavily on a gold-headed cane, out of breath, a royal-blue waistcoat. Heavy and slow. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-marilyn.png`** — 4:5 portrait

```text
A bored ingénue twirling a closed lace parasol over her shoulder, a royal-blue bonnet ribbon. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-bridget.png`** — 4:5 portrait

```text
A squire's daughter in a riding habit and small top hat, riding crop in hand, ears of wheat rising at the bottom edge, a royal-blue hat veil. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-zara.png`** — 4:5 portrait

```text
A travelling heiress in a silk turban pinned with a large royal-blue jewel, a spyglass in hand. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-belle.png`** — 4:5 portrait

```text
A lady out hunting in a veiled hat and tweed jacket, a fowling piece on her shoulder, fern fronds rising at the bottom edge, a royal-blue hat band. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

---

<a id="batch-05"></a>

## Batch 05 · Nobles II — the well-fed (10)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is ten Noble Humans — the vampires' prey, villagers of an 1840s–1880s Carpathian village who have no idea a vampire is watching; expressive storybook faces. The richest, plumpest aristocrats: silks, furs, jewels, powdered wigs. Identical crop, pose and lighting across the set, and the same as every other Human batch: half body from the waist up, facing three-quarters left, cool moonlight from the upper left. The Noble colour is royal blue (#60a5fa): it appears on one sash, ribbon, bow or jewel and nowhere else — it is the only saturated colour. How appetising each Human looks is named in the prompt: pallid and scrawny, ordinary, or plump and rosy-cheeked. Portrait composition, 4:5 aspect ratio, the figure cut cleanly at the waist along the bottom edge. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark.
```

**`human-carlyle.png`** — 4:5 portrait

```text
A young dandy lord in a tall silk top hat with a monocle and kid gloves, a royal-blue silk cravat. Plump, rosy-cheeked and well-dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-ophelia.png`** — 4:5 portrait

```text
A pale young lady with ringlets, holding a half-open lace fan, a pearl necklace and a royal-blue hair ribbon. Plump-cheeked, rosy and well-dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-tania.png`** — 4:5 portrait

```text
A grand duchess in a fur stole and a sparkling tiara, a royal-blue sapphire pendant on her bosom, chin raised haughtily. Plump, rosy-cheeked and richly dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-elois.png`** — 4:5 portrait

```text
A pious noblewoman in a lace mantilla, clutching a small stoppered glass vial of holy water to her bodice, a royal-blue brooch. Plump, rosy-cheeked and well-dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-prince-godfrey.png`** — 4:5 portrait

```text
A portly young prince with a thin gold circlet, a royal-blue sash across his chest hung with medals, a self-satisfied smile. Plump, rosy-cheeked and richly dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-theresa.png`** — 4:5 portrait

```text
A cheerfully tipsy countess with her tiara slipping askew, holding a pewter tankard, a royal-blue gown. Plump, rosy-cheeked and well-dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-wentworth.png`** — 4:5 portrait

```text
A stout lord with magnificent mutton-chop whiskers and a heavy gold watch chain across his waistcoat, a royal-blue sash. Plump, rosy-cheeked and richly dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-henrietta.png`** — 4:5 portrait

```text
A plump marchioness under a towering powdered wig decorated with a tiny ship, a beauty mark, royal-blue bows. Plump, rosy-cheeked and richly dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-baron-christien.png`** — 4:5 portrait

```text
A lovesick young baron gazing at an open locket holding a portrait of a flower-girl, a rose in his lapel, a royal-blue sash. Plump, rosy-cheeked and well-dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-catarina.png`** — 4:5 portrait

```text
A flamboyant opera patroness in ostrich feathers, one hand raised and waving, mid-chatter, royal-blue opera gloves. Plump, rosy-cheeked and well-dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is royal blue (#60a5fa), on one sash, ribbon, bow or jewel. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

---

<a id="batch-06"></a>

## Batch 06 · Religious I — the humble (10)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is ten Religious Humans — the vampires' prey, villagers of an 1840s–1880s Carpathian village who have no idea a vampire is watching; expressive storybook faces. Lower clergy and the devout poor: acolytes, friars, nuns, hermits; plain habits. Identical crop, pose and lighting across the set, and the same as every other Human batch: half body from the waist up, facing three-quarters left, cool moonlight from the upper left. The Religious colour is candle yellow (#facc15): it appears on one stole, cord, ribbon or candle glow and nowhere else — it is the only saturated colour. How appetising each Human looks is named in the prompt: pallid and scrawny, ordinary, or plump and rosy-cheeked. Portrait composition, 4:5 aspect ratio, the figure cut cleanly at the waist along the bottom edge. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark.
```

**`human-dee.png`** — 4:5 portrait

```text
A scholarly young nun with round spectacles absorbed in a large open book, a candle-yellow ribbon bookmark. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-bolat.png`** — 4:5 portrait

```text
A young acolyte nervously sprinkling holy water from a small glass vial, a candle-yellow surplice trim. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-faith.png`** — 4:5 portrait

```text
A cheerful country nun carrying a wheat sheaf, ears of wheat rising at the bottom edge, a candle-yellow belt cord. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-rufus.png`** — 4:5 portrait

```text
A red-haired friar, flushed and sweating, a braid of garlic around his neck, a candle-yellow rope belt. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-ruth.png`** — 4:5 portrait

```text
A meek parish widow with hands clasped in prayer, eyes downcast, a candle-yellow prayer ribbon. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-ozmo.png`** — 4:5 portrait

```text
An eccentric hermit monk with a wild beard and a bird's nest in it, a candle-yellow patch on his ragged habit. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-mycroft.png`** — 4:5 portrait

```text
A bespectacled seminarian carefully writing in a ledger with a quill, a candle-yellow ink stain. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-nemes.png`** — 4:5 portrait

```text
A heavy old archdeacon leaning on a cane, a thick register of the faithful under his arm, a candle-yellow bookmark. Pallid, heavy and slow. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-friar-tunk.png`** — 4:5 portrait

```text
A jolly rotund friar with a tonsure gnawing a ham hock, a candle-yellow rope belt. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-cotton.png`** — 4:5 portrait

```text
A severe Puritan pastor in a wide-brimmed black hat and white collar, a candle-yellow hymnal. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

---

<a id="batch-07"></a>

## Batch 07 · Religious II — the high clergy (10)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is ten Religious Humans — the vampires' prey, villagers of an 1840s–1880s Carpathian village who have no idea a vampire is watching; expressive storybook faces. Abbesses, bishops, preachers and priestesses: richer vestments, more authority. Identical crop, pose and lighting across the set, and the same as every other Human batch: half body from the waist up, facing three-quarters left, cool moonlight from the upper left. The Religious colour is candle yellow (#facc15): it appears on one stole, cord, ribbon or candle glow and nowhere else — it is the only saturated colour. How appetising each Human looks is named in the prompt: pallid and scrawny, ordinary, or plump and rosy-cheeked. Portrait composition, 4:5 aspect ratio, the figure cut cleanly at the waist along the bottom edge. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark.
```

**`human-eleanor.png`** — 4:5 portrait

```text
An abbess in a black habit counting a long rosary, a candle-yellow stole. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-the-priestess.png`** — 4:5 portrait

```text
A majestic priestess in heavy gilded vestments, a tall crozier in one hand, candle-yellow embroidery glowing. Plump, rosy-cheeked and richly dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-bradford.png`** — 4:5 portrait

```text
A portly bishop in a tall mitre giving a blessing, a candle-yellow cope. Plump, rosy-cheeked and well-dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-mary.png`** — 4:5 portrait

```text
A serene choir nun holding a lit candle, its candle-yellow glow on her face. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-zephania.png`** — 4:5 portrait

```text
A stern prophetess in a deep hood holding out a heavy silver chalice and a platter of bread, a candle-yellow mantle. Plump, rosy-cheeked and well-dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-brother-stewart.png`** — 4:5 portrait

```text
A cellarer monk with a big ring of iron keys at his belt and a round loaf under his arm, a candle-yellow cord. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-wright.png`** — 4:5 portrait

```text
A fiery preacher mid-sermon, arm raised high holding a bible aloft, a candle-yellow preaching stole. Plump, rosy-cheeked and well-dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-father-eli.png`** — 4:5 portrait

```text
An old parish priest leaning on a cane, stooped and heavy, a candle-yellow stole. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-cantor-sami.png`** — 4:5 portrait

```text
A cantor singing with his head thrown back, a small stoppered glass vial of holy water in one hand, a candle-yellow prayer shawl stripe. Plump, rosy-cheeked and well-dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-simone.png`** — 4:5 portrait

```text
A stern Mother Superior with a large pectoral cross, arms folded, a candle-yellow wimple band. Plump, rosy-cheeked and well-dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is candle yellow (#facc15), on one stole, cord, ribbon or candle glow. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

---

<a id="batch-08"></a>

## Batch 08 · Villagers I — children and the poor (10)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is ten Villager Humans — the vampires' prey, villagers of an 1840s–1880s Carpathian village who have no idea a vampire is watching; expressive storybook faces. Running children, drunks, tinkers, old women and the headman: ragged, patched clothes. Identical crop, pose and lighting across the set, and the same as every other Human batch: half body from the waist up, facing three-quarters left, cool moonlight from the upper left. The Villager colour is bone white (#e7e5e4), drawn as unbleached linen: it appears on one kerchief, apron, shirt or shawl and nowhere else — it is the only saturated colour. How appetising each Human looks is named in the prompt: pallid and scrawny, ordinary, or plump and rosy-cheeked. Portrait composition, 4:5 aspect ratio, the figure cut cleanly at the waist along the bottom edge. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark.
```

**`human-momo.png`** — 4:5 portrait

```text
A small child running and laughing, rolling a wooden hoop with a stick, a bone-white linen kerchief. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-billy.png`** — 4:5 portrait

```text
A barefoot boy running with a slingshot and a cheeky grin, a bone-white linen shirt. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-bruce.png`** — 4:5 portrait

```text
A lanky stable boy hurrying with a slopping water bucket, a bone-white linen apron. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-boo.png`** — 4:5 portrait

```text
A cheeky child running under a bone-white bedsheet "ghost" costume with two eye-holes, bare feet showing. Scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-reyda.png`** — 4:5 portrait

```text
A messenger girl sprinting mid-stride with a sealed letter, skirts and braids flying, motion lines, a bone-white linen kerchief. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-bippo.png`** — 4:5 portrait

```text
The village drunk, cheerfully tipsy, holding up a pewter tankard, a bone-white linen neckerchief. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-o-nel.png`** — 4:5 portrait

```text
A travelling tinker hung with dented pots and pans, a bone-white linen neckerchief. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-patricia.png`** — 4:5 portrait

```text
An old market woman leaning on a cane, stooped and heavy, a covered basket on her arm, a bone-white linen headscarf. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-yaga.png`** — 4:5 portrait

```text
A stooped old crone with a black cat on her shoulder, one hand raised and waving, mid-chatter, heavy and slow, a bone-white linen shawl. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-szalai.png`** — 4:5 portrait

```text
A thin village headman with a mayoral chain, holding a register of the villagers' names, a bone-white linen collar. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

---

<a id="batch-09"></a>

## Batch 09 · Villagers II — tradesfolk (10)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is ten Villager Humans — the vampires' prey, villagers of an 1840s–1880s Carpathian village who have no idea a vampire is watching; expressive storybook faces. Working tradespeople with the tools of their trade: sturdy work clothes, rolled sleeves. Identical crop, pose and lighting across the set, and the same as every other Human batch: half body from the waist up, facing three-quarters left, cool moonlight from the upper left. The Villager colour is bone white (#e7e5e4), drawn as unbleached linen: it appears on one kerchief, apron, shirt or shawl and nowhere else — it is the only saturated colour. How appetising each Human looks is named in the prompt: pallid and scrawny, ordinary, or plump and rosy-cheeked. Portrait composition, 4:5 aspect ratio, the figure cut cleanly at the waist along the bottom edge. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark.
```

**`human-roxane.png`** — 4:5 portrait

```text
A beautiful young flower-seller with a basket of wild flowers on her arm, a bone-white linen kerchief, completely unaware she is loved by two suitors. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-eponime.png`** — 4:5 portrait

```text
A washerwoman with rolled sleeves carrying a basket of bone-white linen on her hip. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-juri.png`** — 4:5 portrait

```text
A cheerfully tipsy village fiddler, fiddle under one arm and a pewter tankard raised in the other, a bone-white linen shirt. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-favina.png`** — 4:5 portrait

```text
A floury baker woman proudly holding a tray of loaves, a bone-white linen apron. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-anton.png`** — 4:5 portrait

```text
A garlic farmer, flushed and sweating, a long braid of garlic and red peppers over his shoulder, a bone-white linen smock. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-eunice.png`** — 4:5 portrait

```text
A flushed, sweating cook stirring a steaming pot of red paprika stew, a string of red peppers behind her ear, a bone-white linen apron. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-boris.png`** — 4:5 portrait

```text
A broad-shouldered woodcutter with an axe over his shoulder, a bone-white linen shirt. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-angus.png`** — 4:5 portrait

```text
A burly butcher with a cleaver, a string of sausages over his shoulder and a platter of meat, a bone-white linen apron. Plump and rosy-cheeked. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-bernard.png`** — 4:5 portrait

```text
A flushed, sweating pepper-seller hung with strings of dried red chilli peppers, a bone-white linen apron. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-ivo.png`** — 4:5 portrait

```text
A young shepherd with a crook and a lamb under one arm, a bone-white sheepskin vest. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is bone white (#e7e5e4), drawn as unbleached linen, on one kerchief, apron, shirt or shawl. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

---

<a id="batch-10"></a>

## Batch 10 · Military I — the rank and file (10)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is ten Military Humans — the vampires' prey, villagers of an 1840s–1880s Carpathian village who have no idea a vampire is watching; expressive storybook faces. Private soldiers, drummers, pipers, sentries and camp followers: worn uniforms. Identical crop, pose and lighting across the set, and the same as every other Human batch: half body from the waist up, facing three-quarters left, cool moonlight from the upper left. The Military colour is regimental red (#ef4444): it appears on the uniform facings, plume, sash or flag and nowhere else — it is the only saturated colour. How appetising each Human looks is named in the prompt: pallid and scrawny, ordinary, or plump and rosy-cheeked. Portrait composition, 4:5 aspect ratio, the figure cut cleanly at the waist along the bottom edge. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark.
```

**`human-uwe.png`** — 4:5 portrait

```text
A grenadier in a spiked leather helmet, musket at shoulder arms, regimental-red facings. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-campbell.png`** — 4:5 portrait

```text
A cheerfully tipsy Highland piper, bagpipes under one arm and a pewter tankard in the other hand, a regimental-red tartan sash. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-peter.png`** — 4:5 portrait

```text
A young drummer boy with his drum slung at his hip, holding out an open ration tin of food, regimental-red drum hoops. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-eli.png`** — 4:5 portrait

```text
A thin old recruiting sergeant with a quill and an open roll book of soldiers' names, regimental-red chevrons. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-tyre.png`** — 4:5 portrait

```text
A skinny, yawning sentry holding a pike too tall for him, a regimental-red collar. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-eglantine.png`** — 4:5 portrait

```text
A cheerfully tipsy cantinière with a small brandy keg on a strap, raising a pewter tankard, a regimental-red jacket. Plump and rosy-cheeked. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-murdoch.png`** — 4:5 portrait

```text
A thin gamekeeper-rifleman in a green jacket with a rifle on his shoulder, fern fronds rising at the bottom edge, a regimental-red hat cord. Pallid and scrawny. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-harper.png`** — 4:5 portrait

```text
A bugler blowing a brass bugle, cheeks puffed, a regimental-red bugle cord. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-marcel.png`** — 4:5 portrait

```text
A soldier-chaplain in a kepi, a small stoppered glass vial of holy water in his hand, regimental-red trouser stripe and cuffs. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-titus.png`** — 4:5 portrait

```text
A flushed, sweating artillery gunner with a powder-blackened face and a garland of dried red peppers, a rammer over his shoulder, regimental-red cuffs. Plump and rosy-cheeked. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

---

<a id="batch-11"></a>

## Batch 11 · Military II — officers and duellists (10)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is ten Military Humans — the vampires' prey, villagers of an 1840s–1880s Carpathian village who have no idea a vampire is watching; expressive storybook faces. Officers, cavalrymen, standard-bearers and swordswomen: braid, plumes and swagger. Identical crop, pose and lighting across the set, and the same as every other Human batch: half body from the waist up, facing three-quarters left, cool moonlight from the upper left. The Military colour is regimental red (#ef4444): it appears on the uniform facings, plume, sash or flag and nowhere else — it is the only saturated colour. How appetising each Human looks is named in the prompt: pallid and scrawny, ordinary, or plump and rosy-cheeked. Portrait composition, 4:5 aspect ratio, the figure cut cleanly at the waist along the bottom edge. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark.
```

**`human-grant.png`** — 4:5 portrait

```text
A mustachioed cavalry captain with his sabre hilt at his hip, regimental-red frogging. Plump, rosy-cheeked and well-dressed. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-diego.png`** — 4:5 portrait

```text
A heavy cuirassier in a steel breastplate and crested helmet, leaning on his sheathed sword like a cane, heavy and slow, a regimental-red sash. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-calvin.png`** — 4:5 portrait

```text
A hussar courier mid-stride, pelisse and plume flying, motion lines, a dispatch case, regimental-red dolman. Plump and rosy-cheeked. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-khasar.png`** — 4:5 portrait

```text
A steppe horse-archer in a fur-trimmed cap with a recurve bow, a regimental-red sash. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-ivan.png`** — 4:5 portrait

```text
A burly Cossack officer in a tall fur papakha hat with cartridge loops across his chest and a curved shashka, regimental-red coat. Plump, rosy-cheeked and imposing. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-cyrana.png`** — 4:5 portrait

```text
A swashbuckling swordswoman with a long nose and a great plumed hat, rapier at her hip, holding a love letter to her heart, a regimental-red plume. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-isabel.png`** — 4:5 portrait

```text
A musketeer woman with a single rose tucked in her broad-brimmed hat, musket at her side, a regimental-red tabard. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-arthur.png`** — 4:5 portrait

```text
A fresh-faced young lieutenant straightening his collar, a regimental-red tunic. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-archibald.png`** — 4:5 portrait

```text
A monocled colonel with a walrus moustache and a swagger stick under his arm, regimental-red tunic. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`human-victoria.png`** — 4:5 portrait

```text
A standard-bearer raising a regimental flag high above her head, rallying, the flag regimental red. Ordinary build. Half body from the waist up, facing three-quarters left, unaware of the vampire watching, the figure cut cleanly at the waist along the bottom edge. The only saturated colour is regimental red (#ef4444), on the uniform facings, plume, sash or flag. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

---

<a id="batch-12"></a>

## Batch 12 · Familiars (10)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is the ten Familiars — beasts a vampire has corrupted. They are menacing and deathly, never cute, friendly or inviting: undead, half-dead and wholly hungry — gaunt, ribs and joints showing through mangy fur, feathers or scales, patches of bare grey skin, bared teeth or beak, long claws, eyes burning a glowing violet. Violet (#a78bfa) is the Familiar colour and dominates every picture: the whole creature washed in violet and violet-black shadows, a cold violet rim light, a faint violet miasma rising off it. The only other colour is a small dark blood-red (#9b111e) drop hanging from a rusted iron collar. Identical treatment across the set: full body, three-quarters left, the same scale and lighting. Square composition, 1:1 aspect ratio. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark.
```

**`familiar-goat.png`** — 1:1 square

```text
A black goat with long twisted horns, head lowered to charge, slit pupils, forelegs braced, breath steaming. An undead vampire's familiar, full body, three-quarters left: gaunt and half-dead, ribs and joints showing, bared teeth, long claws, eyes burning glowing violet. The whole creature washed in violet (#a78bfa) and violet-black shadows with a cold violet rim light and a faint violet miasma rising off it; The only other colour is a small dark blood-red (#9b111e) drop hanging from a rusted iron collar. Menacing and deathly, nothing friendly or cute. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`familiar-wolf.png`** — 1:1 square

```text
An emaciated grey wolf, hackles raised, crouched to spring, lips peeled back from long fangs, snarling. An undead vampire's familiar, full body, three-quarters left: gaunt and half-dead, ribs and joints showing, bared teeth, long claws, eyes burning glowing violet. The whole creature washed in violet (#a78bfa) and violet-black shadows with a cold violet rim light and a faint violet miasma rising off it; The only other colour is a small dark blood-red (#9b111e) drop hanging from a rusted iron collar. Menacing and deathly, nothing friendly or cute. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`familiar-pigeon.png`** — 1:1 square

```text
A carrion pigeon with ragged feathers, wings half-raised and moth-eaten, beak open in a hiss, talons clawing forward. An undead vampire's familiar, full body, three-quarters left: gaunt and half-dead, ribs and joints showing, bared teeth, long claws, eyes burning glowing violet. The whole creature washed in violet (#a78bfa) and violet-black shadows with a cold violet rim light and a faint violet miasma rising off it; The only other colour is a small dark blood-red (#9b111e) drop hanging from a rusted iron collar. Menacing and deathly, nothing friendly or cute. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`familiar-dog.png`** — 1:1 square

```text
A starved black hound with a ragged ear, straining forward, foam at the jaws, snarling. An undead vampire's familiar, full body, three-quarters left: gaunt and half-dead, ribs and joints showing, bared teeth, long claws, eyes burning glowing violet. The whole creature washed in violet (#a78bfa) and violet-black shadows with a cold violet rim light and a faint violet miasma rising off it; The only other colour is a small dark blood-red (#9b111e) drop hanging from a rusted iron collar. Menacing and deathly, nothing friendly or cute. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`familiar-pig.png`** — 1:1 square

```text
A bristled black boar-pig with cracked tusks, rooting forward, small cruel eyes, mud and worse on its snout. An undead vampire's familiar, full body, three-quarters left: gaunt and half-dead, ribs and joints showing, bared teeth, long claws, eyes burning glowing violet. The whole creature washed in violet (#a78bfa) and violet-black shadows with a cold violet rim light and a faint violet miasma rising off it; The only other colour is a small dark blood-red (#9b111e) drop hanging from a rusted iron collar. Menacing and deathly, nothing friendly or cute. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`familiar-owl.png`** — 1:1 square

```text
A skeletal long-eared owl, wings spread wide, head swivelled unnaturally, a torn mission scroll in its talons. An undead vampire's familiar, full body, three-quarters left: gaunt and half-dead, ribs and joints showing, bared teeth, long claws, eyes burning glowing violet. The whole creature washed in violet (#a78bfa) and violet-black shadows with a cold violet rim light and a faint violet miasma rising off it; The only other colour is a small dark blood-red (#9b111e) drop hanging from a rusted iron collar. Menacing and deathly, nothing friendly or cute. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`familiar-rat.png`** — 1:1 square

```text
A bloated plague rat with a hairless tail, reared up on its hind legs, yellowed incisors bared, claws raised. An undead vampire's familiar, full body, three-quarters left: gaunt and half-dead, ribs and joints showing, bared teeth, long claws, eyes burning glowing violet. The whole creature washed in violet (#a78bfa) and violet-black shadows with a cold violet rim light and a faint violet miasma rising off it; The only other colour is a small dark blood-red (#9b111e) drop hanging from a rusted iron collar. Menacing and deathly, nothing friendly or cute. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`familiar-snake.png`** — 1:1 square

```text
A long python with a scaled skull-like head, coiled to strike, jaws unhinged wide, forked tongue out. An undead vampire's familiar, full body, three-quarters left: gaunt and half-dead, ribs and joints showing, bared teeth, long claws, eyes burning glowing violet. The whole creature washed in violet (#a78bfa) and violet-black shadows with a cold violet rim light and a faint violet miasma rising off it; The only other colour is a small dark blood-red (#9b111e) drop hanging from a rusted iron collar. Menacing and deathly, nothing friendly or cute. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`familiar-bear.png`** — 1:1 square

```text
A hulking gaunt brown bear, rearing up on its hind legs, claws spread, roaring. An undead vampire's familiar, full body, three-quarters left: gaunt and half-dead, ribs and joints showing, bared teeth, long claws, eyes burning glowing violet. The whole creature washed in violet (#a78bfa) and violet-black shadows with a cold violet rim light and a faint violet miasma rising off it; The only other colour is a small dark blood-red (#9b111e) drop hanging from a rusted iron collar. Menacing and deathly, nothing friendly or cute. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`familiar-panther.png`** — 1:1 square

```text
A black panther, crouched to pounce, ears flat, jaws open showing long fangs. An undead vampire's familiar, full body, three-quarters left: gaunt and half-dead, ribs and joints showing, bared teeth, long claws, eyes burning glowing violet. The whole creature washed in violet (#a78bfa) and violet-black shadows with a cold violet rim light and a faint violet miasma rising off it; The only other colour is a small dark blood-red (#9b111e) drop hanging from a rusted iron collar. Menacing and deathly, nothing friendly or cute. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-13"></a>

## Batch 13 · Powers (7)

Same-named Powers share one picture: `vampiric-will-double` uses `power-vampiric-will.png`, `vampiric-strength-great` uses `power-vampiric-strength.png`, both Vampiric Speeds use `power-vampiric-speed.png`.

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is the seven vampire Powers — supernatural tricks, each a single vignette. Where a vampire appears it is an anonymous cloaked vampire in a high-collared black cape (never one of the player Vampires), often only its hands or shadow. Emerald green (#34d399) is the Power colour and dominates every picture: the whole vignette washed in emerald and emerald-black shadows, lit by a cold emerald supernatural glow. Menacing and uncanny. Portrait composition, 4:5 aspect ratio, the vignette centred. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark.
```

**`power-hypnosis.png`** — 4:5 portrait

```text
A vampire's face in shadow with wide mesmerising eyes, a silver pendulum swinging before them, concentric emerald rings rippling outwards. Any vampire shown is an anonymous cloaked vampire in a high-collared black cape. The whole vignette washed in emerald green (#34d399) and emerald-black shadows, lit by a cold emerald supernatural glow. Menacing and uncanny, the vignette centred. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`power-form-of-mist.png`** — 4:5 portrait

```text
A vampire dissolving from the feet upwards into curling emerald-tinged mist. Any vampire shown is an anonymous cloaked vampire in a high-collared black cape. The whole vignette washed in emerald green (#34d399) and emerald-black shadows, lit by a cold emerald supernatural glow. Menacing and uncanny, the vignette centred. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`power-form-of-bat.png`** — 4:5 portrait

```text
A vampire bursting apart into a swirl of bats, the cape turning into wings. Any vampire shown is an anonymous cloaked vampire in a high-collared black cape. The whole vignette washed in emerald green (#34d399) and emerald-black shadows, lit by a cold emerald supernatural glow. Menacing and uncanny, the vignette centred. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`power-vampiric-will.png`** — 4:5 portrait

```text
A long-nailed clawed hand fanning three face-down playing cards, emerald sparks between the fingers. Any vampire shown is an anonymous cloaked vampire in a high-collared black cape. The whole vignette washed in emerald green (#34d399) and emerald-black shadows, lit by a cold emerald supernatural glow. Menacing and uncanny, the vignette centred. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`power-vampiric-speed.png`** — 4:5 portrait

```text
A vampire streaking sideways, reduced to a smear of cape and emerald motion lines. Any vampire shown is an anonymous cloaked vampire in a high-collared black cape. The whole vignette washed in emerald green (#34d399) and emerald-black shadows, lit by a cold emerald supernatural glow. Menacing and uncanny, the vignette centred. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`power-vampiric-strength.png`** — 4:5 portrait

```text
A clawed fist bending a thick iron bar, emerald glow at the knuckles. Any vampire shown is an anonymous cloaked vampire in a high-collared black cape. The whole vignette washed in emerald green (#34d399) and emerald-black shadows, lit by a cold emerald supernatural glow. Menacing and uncanny, the vignette centred. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`power-vampiric-stealth.png`** — 4:5 portrait

```text
A vampire's long shadow creeping along a wall ahead of it, only the shadow's eyes glowing emerald. Any vampire shown is an anonymous cloaked vampire in a high-collared black cape. The whole vignette washed in emerald green (#34d399) and emerald-black shadows, lit by a cold emerald supernatural glow. Menacing and uncanny, the vignette centred. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

---

<a id="batch-14"></a>

## Batch 14 · Relics and still lifes (10)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and moody. This batch is objects: the vampire's own relics and the Roses — still lifes of goblets, capes, candles, keys and flowers, each a single object or small group centred on the canvas, lit by cool moonlight with a single hard highlight. The colour named in each prompt dominates that picture; nothing else is saturated. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark.
```

**`starting-the-hunger.png`** — 4:5 portrait

```text
An empty silver goblet with a small bat perched on its rim, wings half-spread, the whole vignette washed in emerald green (#34d399) and emerald-black shadows, lit by a cold emerald supernatural glow. Centred, lit by cool moonlight with a single hard highlight. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`starting-vampire-speed.png`** — 4:5 portrait

```text
A black cape billowing across a full moon, trailing motion lines, the whole vignette washed in emerald green (#34d399) and emerald-black shadows, lit by a cold emerald supernatural glow. Centred, lit by cool moonlight with a single hard highlight. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`starting-vampire-thirst.png`** — 4:5 portrait

```text
An empty crystal goblet tipped on its side, a last drop of dark red wine (#9b111e) at its lip, the whole vignette washed in emerald green (#34d399) and emerald-black shadows, lit by a cold emerald supernatural glow. Centred, lit by cool moonlight with a single hard highlight. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`starting-vampire-strength.png`** — 4:5 portrait

```text
A long-nailed hand bending the iron bars of a crypt gate, the whole vignette washed in emerald green (#34d399) and emerald-black shadows, lit by a cold emerald supernatural glow. Centred, lit by cool moonlight with a single hard highlight. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`rose-eternal.png`** — 4:5 portrait

```text
A still life: a single rose in perfect bloom under a tall glass bell jar, a few tiny sparkles inside the glass. The rose petals in rose crimson (#fb7185). The object centred. Centred, lit by cool moonlight with a single hard highlight. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`rose-dead.png`** — 4:5 portrait

```text
A still life: a single withered rose, blackened petals curling, one crimson petal still clinging on, a thorny stem. The rose petals in rose crimson (#fb7185). The object centred. Centred, lit by cool moonlight with a single hard highlight. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`rose-perfect.png`** — 4:5 portrait

```text
A still life: a single flawless rose in a slender crystal bud vase, a dew drop on one petal. The rose petals in rose crimson (#fb7185). The object centred. Centred, lit by cool moonlight with a single hard highlight. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`zone-deck.png`** — 1:1 square

```text
A closed wooden coffin with brass handles, seen from above at a slight angle. Centred, lit by cool moonlight with a single hard highlight. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`zone-discard.png`** — 1:1 square

```text
A small untidy heap of discarded things: a snuffed candle, a torn glove, a cracked porcelain mask. Centred, lit by cool moonlight with a single hard highlight. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`zone-digestion.png`** — 1:1 square

```text
A round-bellied silver goblet brimming with dark red wine (#9b111e). Centred, lit by cool moonlight with a single hard highlight. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-15"></a>

## Batch 15 · Scenes and backgrounds (9)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is opaque, full-bleed scenes — no isolated subject, no transparency. They sit behind cards and screens, so they stay quiet: soft focus, low contrast, a heavy dark vignette at the edges, empty of people and animals unless the prompt says otherwise. The colour named in each prompt washes the whole scene. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark.
```

**`backdrop-villager.png`** — 4:5 portrait, opaque

```text
A quiet night-time background for a portrait card: a cobbled village lane with shuttered cottages, the whole background washed in bone white (#e7e5e4), very low contrast, soft focus, a heavy dark vignette at the edges, no people, no animals, no focal object. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`backdrop-religious.png`** — 4:5 portrait, opaque

```text
A quiet night-time background for a portrait card: a chapel nave with tall arched windows, the whole background washed in candle yellow (#facc15), very low contrast, soft focus, a heavy dark vignette at the edges, no people, no animals, no focal object. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`backdrop-military.png`** — 4:5 portrait, opaque

```text
A quiet night-time background for a portrait card: a barracks yard with tents and a flagpole, the whole background washed in regimental red (#ef4444), very low contrast, soft focus, a heavy dark vignette at the edges, no people, no animals, no focal object. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`backdrop-noble.png`** — 4:5 portrait, opaque

```text
A quiet night-time background for a portrait card: a ballroom with chandeliers and tall mirrors, the whole background washed in royal blue (#60a5fa), very low contrast, soft focus, a heavy dark vignette at the edges, no people, no animals, no focal object. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`backdrop-familiar.png`** — 4:5 portrait, opaque

```text
A quiet night-time background for a portrait card: a moonlit sky over black dead trees, the whole background washed in violet (#a78bfa), very low contrast, soft focus, a heavy dark vignette at the edges, no people, no animals, no focal object. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`backdrop-power.png`** — 4:5 portrait, opaque

```text
A quiet night-time background for a portrait card: swirling fog, the whole background washed in emerald green (#34d399), very low contrast, soft focus, a heavy dark vignette at the edges, no people, no animals, no focal object. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`backdrop-rose.png`** — 4:5 portrait, opaque

```text
A quiet night-time background for a portrait card: a walled garden with climbing roses, the whole background washed in rose crimson (#fb7185), very low contrast, soft focus, a heavy dark vignette at the edges, no people, no animals, no focal object. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Portrait composition, 4:5 aspect ratio.
```

**`hunt-track-mat.png`** — 3:2 landscape, opaque

```text
An empty wooden market-stall counter seen from the front with three equal bays under a striped awning, the bays left empty for cards, dark wood, candlelight, no goods, no people, no text. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Landscape composition, 3:2 aspect ratio.
```

**`sunrise-backdrop.png`** — 16:9 landscape, opaque

```text
The first light of dawn breaking over a Carpathian valley, a gothic castle on a crag in silhouette, its doors glowing with candlelight, a graveyard and a mountain pass in the middle distance, long pink and gold streaks across a deep blue sky, mist in the valleys, no figures, no text. The upper third mostly sky for a title. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Landscape composition, 16:9 aspect ratio.
```

---

<a id="batch-16"></a>

## Batch 16 · Icons I — card stats (10)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is game icons, so simplify the style above: each is a single bold emblem in the manner of a carved woodcut stamp — thick even sepia-black (#2a1f1a) lines, solid fills, no fine hatching, no watercolour wash, no gradients, no background shape unless named, one flat accent colour only where the prompt names it. They must read at 16 px, and the whole set shares one line weight and one level of detail. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. Square composition, the emblem centred and filling about 80% of the canvas. These are the numbers and actions on a card face.
```

**`icon-speed.png`** — 1:1 square

```text
A single bat wing swept back, with three speed lines. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-vp.png`** — 1:1 square

```text
A single plump blood drop, filled solid dark blood red (#9b111e). A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-hunt.png`** — 1:1 square

```text
A pair of vampire fangs seen from the front. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-extra-hunt.png`** — 1:1 square

```text
A pair of fangs with a small plus sign beside them. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-draw.png`** — 1:1 square

```text
A card being lifted off a small stack with an upward arrow. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-discard.png`** — 1:1 square

```text
A card falling onto a small pile with a downward arrow. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-discard-draw.png`** — 1:1 square

```text
Two cards swapping places with a circular pair of arrows. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-digest.png`** — 1:1 square

```text
A round-bellied goblet with a lid. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-mission.png`** — 1:1 square

```text
A rolled scroll tied with a ribbon and wax seal. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-push.png`** — 1:1 square

```text
A cloaked figure shoving another off a space, shown as two small silhouettes. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-17"></a>

## Batch 17 · Icons II — keywords (10)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is game icons, so simplify the style above: each is a single bold emblem in the manner of a carved woodcut stamp — thick even sepia-black (#2a1f1a) lines, solid fills, no fine hatching, no watercolour wash, no gradients, no background shape unless named, one flat accent colour only where the prompt names it. They must read at 16 px, and the whole set shares one line weight and one level of detail. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. Square composition, the emblem centred and filling about 80% of the canvas. These are the ten Human and card keywords.
```

**`icon-fast.png`** — 1:1 square

```text
A winged boot. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-slow.png`** — 1:1 square

```text
A walking cane with a snail on the handle. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-spicy.png`** — 1:1 square

```text
A red chilli pepper, filled regimental red (#ef4444). A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-confuse.png`** — 1:1 square

```text
A pewter tankard with foam spilling over. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-holy-water.png`** — 1:1 square

```text
A small stoppered vial with a cross on it. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-gregarious.png`** — 1:1 square

```text
Three small heads close together with speech marks. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-ready.png`** — 1:1 square

```text
An hourglass. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-permanent.png`** — 1:1 square

```text
A heavy padlock. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-unique.png`** — 1:1 square

```text
A six-pointed star. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-inspiring.png`** — 1:1 square

```text
A raised lantern. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-18"></a>

## Batch 18 · Icons III — factions and card kinds (10)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is game icons, so simplify the style above: each is a single bold emblem in the manner of a carved woodcut stamp — thick even sepia-black (#2a1f1a) lines, solid fills, no fine hatching, no watercolour wash, no gradients, no background shape unless named, one flat accent colour only where the prompt names it. They must read at 16 px, and the whole set shares one line weight and one level of detail. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. Square composition, the emblem centred and filling about 80% of the canvas. These mark what kind of card something is.
```

**`icon-villager.png`** — 1:1 square

```text
A pitchfork crossed with a loaf of bread. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-religious.png`** — 1:1 square

```text
A simple cross with flared ends. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-military.png`** — 1:1 square

```text
Two crossed sabres. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-noble.png`** — 1:1 square

```text
A five-pointed crown. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-starting.png`** — 1:1 square

```text
A coffin standing upright. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-power.png`** — 1:1 square

```text
An eye in a swirl. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-familiar.png`** — 1:1 square

```text
A paw print. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-item-rose.png`** — 1:1 square

```text
A single rose on a stem. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-rookie-a.png`** — 1:1 square

```text
A round shield with a single notch — the Rookie mark (the UI adds the letter). A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-stack-top.png`** — 1:1 square

```text
Two small cloaked figures stacked, the upper one with a star. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-19"></a>

## Batch 19 · Icons IV — the land (10)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is game icons, so simplify the style above: each is a single bold emblem in the manner of a carved woodcut stamp — thick even sepia-black (#2a1f1a) lines, solid fills, no fine hatching, no watercolour wash, no gradients, no background shape unless named, one flat accent colour only where the prompt names it. They must read at 16 px, and the whole set shares one line weight and one level of detail. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. Square composition, the emblem centred and filling about 80% of the canvas. These are the map's regions, paths and fates.
```

**`icon-castle.png`** — 1:1 square

```text
A gothic castle with two towers and an open gate. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-cemetery.png`** — 1:1 square

```text
A round-topped tombstone with a cross. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-mountains.png`** — 1:1 square

```text
Two jagged peaks. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-plains.png`** — 1:1 square

```text
Three ears of wheat. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-forest.png`** — 1:1 square

```text
Two pine trees. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-road.png`** — 1:1 square

```text
A winding dirt road seen in perspective. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-rail.png`** — 1:1 square

```text
A short section of railway track. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-boat.png`** — 1:1 square

```text
A rowing boat. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-well.png`** — 1:1 square

```text
A stone well with a bucket and winch. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-ashes.png`** — 1:1 square

```text
A small heap of ashes with one wisp of smoke. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-20"></a>

## Batch 20 · Icons V — places (10)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is game icons, so simplify the style above: each is a single bold emblem in the manner of a carved woodcut stamp — thick even sepia-black (#2a1f1a) lines, solid fills, no fine hatching, no watercolour wash, no gradients, no background shape unless named, one flat accent colour only where the prompt names it. They must read at 16 px, and the whole set shares one line weight and one level of detail. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. Square composition, the emblem centred and filling about 80% of the canvas. These are the buildings and special spaces on the map.
```

**`icon-space-castle.png`** — 1:1 square

```text
The castle gate alone, portcullis raised. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-space-cemetery.png`** — 1:1 square

```text
A wrought-iron cemetery gate. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-crypt.png`** — 1:1 square

```text
A small stone crypt with a pointed doorway. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-labyrinth.png`** — 1:1 square

```text
A square hedge maze seen from above. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-market.png`** — 1:1 square

```text
A striped market stall awning. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-church.png`** — 1:1 square

```text
A church with a steeple. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-mansion.png`** — 1:1 square

```text
A grand house with a columned portico. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-barracks.png`** — 1:1 square

```text
A military tent with a pennant. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-ship.png`** — 1:1 square

```text
A two-masted sailing ship. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-tavern.png`** — 1:1 square

```text
A hanging tavern sign shaped like a tankard. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-21"></a>

## Batch 21 · Icons VI — Mission logic (10)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is game icons, so simplify the style above: each is a single bold emblem in the manner of a carved woodcut stamp — thick even sepia-black (#2a1f1a) lines, solid fills, no fine hatching, no watercolour wash, no gradients, no background shape unless named, one flat accent colour only where the prompt names it. They must read at 16 px, and the whole set shares one line weight and one level of detail. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. Square composition, the emblem centred and filling about 80% of the canvas. These build Mission conditions and their timing.
```

**`icon-majority.png`** — 1:1 square

```text
Three stacks of coins, the tallest one crowned. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-fewest.png`** — 1:1 square

```text
Three stacks of coins, the shortest one marked with a downward arrow. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-set.png`** — 1:1 square

```text
Four small round tokens arranged in a diamond. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-rank-high.png`** — 1:1 square

```text
A laurel wreath with an upward arrow through it. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-rank-low.png`** — 1:1 square

```text
A drooping broken laurel wreath with a downward arrow. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-first-home.png`** — 1:1 square

```text
A castle gate with a single star above it. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-distinct.png`** — 1:1 square

```text
Three overlapping cards, each with a different corner shape. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-per-each.png`** — 1:1 square

```text
Two crossed bones forming a multiplication sign. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-end-of-turn.png`** — 1:1 square

```text
A candle guttering low in its holder. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-end-of-game.png`** — 1:1 square

```text
A half sun rising over a horizon line with rays. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-22"></a>

## Batch 22 · Icons VII — treasure and time (7)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is game icons, so simplify the style above: each is a single bold emblem in the manner of a carved woodcut stamp — thick even sepia-black (#2a1f1a) lines, solid fills, no fine hatching, no watercolour wash, no gradients, no background shape unless named, one flat accent colour only where the prompt names it. They must read at 16 px, and the whole set shares one line weight and one level of detail. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. Square composition, the emblem centred and filling about 80% of the canvas. These are Chests, Bonus tokens and the night's clock.
```

**`icon-chest.png`** — 1:1 square

```text
A closed iron-bound treasure chest. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-chest-open.png`** — 1:1 square

```text
An open treasure chest with its lid raised. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-parasol.png`** — 1:1 square

```text
An open lace parasol. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-velvet.png`** — 1:1 square

```text
A folded velvet cloak with a tassel. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-human-choice.png`** — 1:1 square

```text
A small wheel split into four segments. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-moon.png`** — 1:1 square

```text
A crescent moon. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-instant.png`** — 1:1 square

```text
A four-pointed spark burst, filled gold (#c9a24d). A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-23"></a>

## Batch 23 · Surfaces and textures (6)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is surfaces: patterns, papers and materials that other art is laid on. Keep every one quiet, even and low contrast, with no focal point, so it never competes with what sits on top. Each prompt names whether it is transparent, opaque or seamless.
```

**`back-hunt-pattern.png`** — 1:1 square, seamless

```text
A seamless tileable pattern of small flying bats and crescent moons, evenly spaced, fine sepia-black lines on a fully transparent background, no fill, no large single feature, so the tile repeats without a seam. A seamless tileable tile: opposite edges match exactly so it repeats with no visible seam, no large single feature, no text, no border, no watermark. Square composition, 1:1 aspect ratio.
```

**`board-wood.png`** — 1:1 square, opaque, seamless

```text
A seamless tileable texture of dark polished mahogany with a subtle straight grain, low contrast, no knots or large features, so it tiles without a seam. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. A seamless tileable tile: opposite edges match exactly so it repeats with no visible seam, no large single feature, no text, no border, no watermark. Square composition, 1:1 aspect ratio.
```

**`paper-grain.png`** — 1:1 square, seamless

```text
A seamless tileable cold-press watercolour paper texture: faint fibres, a subtle tooth and a few flecks, drawn in warm sepia-grey at low opacity on a fully transparent background so it can lie over any colour — no colour fill, no edges, no repeating feature. A seamless tileable tile: opposite edges match exactly so it repeats with no visible seam, no large single feature, no text, no border, no watermark. Square composition, 1:1 aspect ratio.
```

**`ink-splatter.png`** — 1:1 square

```text
A few spatters and drips of sepia-black ink, one larger splash and several fine droplets, as if flicked from a nib. Spread loosely across the canvas. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`mission-frame-standard.png`** — 1:1 square, opaque

```text
An empty square tile of aged beige parchment with a thin inked border and small ink flourishes in the corners, a slightly darker band across the top for a title, the rest blank for text, soft stains, no writing. The tile filling the canvas. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`mission-frame-instant.png`** — 1:1 square, opaque

```text
An empty square tile of aged parchment, gilded: a gold-leaf (#c9a24d) border and gold corner flourishes, a darker gold title band, the rest blank for text, no writing. The tile filling the canvas. An opaque image filling the whole canvas edge to edge, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

---

<a id="batch-24"></a>

## Batch 24 · Fittings and tokens (6)

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is small physical game pieces and fittings — brass, stone, iron and wood objects seen straight on, each centred and filling its canvas, with a crisp outline and a single cool highlight so they read as real tokens at small sizes. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark.
```

**`bonus-token-disc.png`** — 1:1 square

```text
A blank round token of worn tarnished brass with a raised rim and a plain, slightly dished centre left empty for an icon. The disc filling the canvas. Seen straight on, centred, a crisp outline and a single cool highlight. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`bonus-token-back.png`** — 1:1 square

```text
The same round brass token face down: a raised rim and an engraved question mark made of a curling bat's tail in the centre. The disc filling the canvas. Seen straight on, centred, a crisp outline and a single cool highlight. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`castle-tile.png`** — 1:1 square

```text
A blank square stone plaque with bevelled edges, a small carved castle tower at the top, the face left smooth and empty for a number. Seen straight on, centred, a crisp outline and a single cool highlight. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`board-corner.png`** — 1:1 square

```text
A single ornate brass coffin-fitting corner bracket with small bat-wing scrolls, fitting the top-left corner of a square. The bracket touching the top and left edges. Seen straight on, centred, a crisp outline and a single cool highlight. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`frame-ornament.png`** — 1:1 square

```text
A small gothic ink corner flourish: one L-shaped ornament of thorny rose vine and a tiny bat, thin lines, nothing else. The ornament touching the top and left edges. Seen straight on, centred, a crisp outline and a single cool highlight. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Square composition, 1:1 aspect ratio.
```

**`tavern-sign.png`** — 4:3 landscape

```text
A hanging wooden tavern sign on an iron bracket, the board painted with a tankard and a crescent moon, weathered, no lettering. Seen straight on, centred, a crisp outline and a single cool highlight. Isolated subject on a fully transparent background, no scene, no ground, no cast shadow, no text, no lettering, no border, no frame, no watermark. Landscape composition, 4:3 aspect ratio.
```

---

---

<a id="batch-25"></a>

## Batch 25 · Icons — regeneration (5)

Replacements for five icons whose first versions were off-scheme: `push` was a cliff scene, `gregarious` fine-hatched faces, `stack-top` a single figure, `set` a skull, heart and candle, and `human-choice` sun, moon and trees. Save them under the same names; the converter picks up the newer files.

**Setup block** — paste first:

```text
Gothic storybook illustration in the Victorian penny-dreadful tradition: confident dark sepia-black ink linework with fine cross-hatched shadows, transparent watercolour washes in bone, dusk-grey and faded ochre, the colour this prompt names used exactly as it says and no other saturated colour, a faint cold-paper grain inside the washes. Dark and sinister, never gory: no blood except the named accent, no wounds. This batch is game icons, so simplify the style above: each is a single bold emblem in the manner of a carved woodcut stamp — thick even sepia-black (#2a1f1a) lines, solid fills, no fine hatching, no watercolour wash, no gradients, no background shape unless named, one flat accent colour only where the prompt names it. They must read at 16 px, and the whole set shares one line weight and one level of detail. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. Square composition, the emblem centred and filling about 80% of the canvas. These five replace icons that came back off-scheme. Every enclosed area is either solid sepia-black ink or left empty — no cream, white or paper-coloured fills — and each is one simple silhouette with no scene around it, as plain as a playing-card pip.
```

**`icon-push.png`** — 1:1 square

```text
Two cloaked figures in silhouette side by side, the left one shoving the right one away with both hands, a short motion line behind the pushed one. No ground, no cliff. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, no cream or white fills, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-gregarious.png`** — 1:1 square

```text
Three simple head-and-shoulders silhouettes huddled close together, overlapping slightly, with two small curved speech marks above them. Solid silhouettes, no faces drawn. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, no cream or white fills, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-stack-top.png`** — 1:1 square

```text
Two small cloaked figures in silhouette stacked one on top of the other, the upper one standing on the lower one's shoulders, a small six-pointed star above the upper one's head. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, no cream or white fills, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-set.png`** — 1:1 square

```text
Four small round tokens arranged in a diamond, each stamped with one tiny symbol: a pitchfork, a cross, a pair of crossed sabres and a crown. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, no cream or white fills, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```

**`icon-human-choice.png`** — 1:1 square

```text
A round wheel divided into four equal segments by a cross, each segment holding one tiny symbol: a pitchfork, a cross, a pair of crossed sabres and a crown, a small arrow pointer at the top of the wheel. A carved woodcut-stamp game icon: thick even sepia-black (#2a1f1a) lines, solid fills, no hatching, no gradients, no cream or white fills, readable at 16 px. Isolated on a fully transparent background, no text, no lettering, no border, no watermark. The emblem centred and filling about 80% of the canvas. Square composition, 1:1 aspect ratio.
```
