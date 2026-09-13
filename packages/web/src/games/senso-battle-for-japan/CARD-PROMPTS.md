# Sensō Card Art

The Sensō deck is **composed, not drawn**: every one of the 54 faces and the back is
assembled by `components/card/CardFace.tsx` from a small set of shared building blocks
on one 400×600 design grid — paper, a clan-coloured frame, the crest as pips or as the
corner mark, a hanging paper ribbon with the brushed clan name, a court figure or a
ninja, a gold halo behind the Ace, a vermilion seal on the advantage suit. Because the
blocks are shared, the deck is coherent by construction. The prompts below generate
**only the blocks** — no card borders, numbers or frames; the UI adds those.

Every block is a **PNG with a fully transparent background**. Drop the raw PNGs into
`packages/web/art-src/senso-cards/<name>.png` (gitignored — the prompts here are the
reproducible source, and `*.png` is LFS-tracked), then run

```bash
pnpm --filter @boardgames/web card-art          # trims, shrinks, writes assets/cards/*.webp
pnpm --filter @boardgames/web card-art --strict # also fails on orphans / over budget
```

and commit the webp files. Art can arrive in any order: every layer has a drawn fallback,
and `/dev/senso-cards` lists what is still missing.

**Status (2026-09-13):** every block below is generated and converted except
`kanji-ninja.png` — the Ninja ribbon draws its text fallback until it lands. The
deck weighs 672 KB of its 1 MB budget.

---

## Shared Style Directive

Prefix every prompt with this, verbatim:

> Japanese woodblock print (ukiyo-e, mokuhanga) illustration: bold black sumi-ink key
> lines, flat mineral pigments, faint paper grain only inside the coloured areas, a hint
> of registration offset. Isolated subject on a fully transparent background, no scene,
> no shadow, no text, no border, no frame, no watermark. Centred, filling about 90% of
> the canvas.

**Palette words** (they match `colors.ts`): Takeda vermilion (#c0392b) · Uesugi indigo
(#2e6fd1) · Oda gold-ochre (#e0b322) · Mōri white (#f2ede4) with charcoal ink (#2a251c) ·
Wood Ninja walnut brown (#6b4f2a) · Jade Ninja jade green (#1f7a4d) · gold leaf (#c9a24d) ·
vermilion seal ink · sumi black.

---

## Files

| File | Canvas | Block | Used on |
| --- | --- | --- | --- |
| `crest-takeda.png` | 1024×1024 | 武田菱 Takeda-bishi | pips, corner mark, Ace, clan-only cards |
| `crest-uesugi.png` | 1024×1024 | 竹に雀 Uesugi-zasa | " |
| `crest-oda.png` | 1024×1024 | 織田木瓜 Oda-mokkō | " |
| `crest-mori.png` | 1024×1024 | 一文字三つ星 Mōri | " |
| `kanji-takeda.png` | 512×1024 | 武田 brushed vertically | ribbon |
| `kanji-uesugi.png` | 512×1024 | 上杉 brushed vertically | ribbon |
| `kanji-oda.png` | 512×1024 | 織田 brushed vertically | ribbon |
| `kanji-mori.png` | 512×1024 | 毛利 brushed vertically | ribbon |
| `kanji-ninja.png` | 1024×1024 | 忍 brushed | ninja ribbon |
| `court-{clan}-jack.png` ×4 | 1024×1280 | ashigaru | J |
| `court-{clan}-queen.png` ×4 | 1024×1280 | onna-musha | Q |
| `court-{clan}-king.png` ×4 | 1024×1280 | daimyō | K |
| `ace-halo.png` | 1024×1024 | gold sunburst ring | A |
| `ninja-wood.png` | 1024×1536 | Wood Ninja | Ninja |
| `ninja-jade.png` | 1024×1536 | Jade Ninja | Ninja |
| `seal-advantage.png` | 512×512 | vermilion hanko 勢 | trump marker |
| `paper-grain.png` | 512×512 seamless | washi fibres | every face |
| `back-pattern.png` | 512×512 seamless | seigaiha waves in gold | back |
| `back-emblem.png` | 1024×1024 | 戦 gold roundel | back |
| `corner-ornament.png` (optional, later) | 512×512 | ink corner flourish | frame |

`{clan}` is one of `takeda`, `uesugi`, `oda`, `mori`. The script derives the small
`crest-*-sm` variants itself.

---

## 1. Clan crests (mon)

Crisp, bold silhouettes — they are read at 8 px as pips and at 200 px on the Ace. Fill
the canvas; no ring or cartouche around the crest unless the prompt says so.

**`crest-takeda.png`**
> [directive] A Japanese family crest (kamon), the Takeda-bishi 武田菱: one large diamond
> divided by a thin cross into four smaller diamonds, printed in flat vermilion (#c0392b)
> with bold black sumi-ink outlines. Square composition.

**`crest-uesugi.png`**
> [directive] A Japanese family crest (kamon), the Uesugi-zasa 竹に雀: two small sparrows
> facing each other in the centre, enclosed by a round wreath of bamboo leaves, printed in
> flat indigo (#2e6fd1) with bold black sumi-ink outlines, sparrows in charcoal and paper
> white. Square composition, strong silhouette.

**`crest-oda.png`**
> [directive] A Japanese family crest (kamon), the Oda-mokkō 織田木瓜: a rounded four-lobed
> mokkō flower with the inner shell-shaped ring, printed in flat gold-ochre (#e0b322) with
> bold black sumi-ink outlines. Square composition.

**`crest-mori.png`**
> [directive] A Japanese family crest (kamon), the Mōri ichimonji-ni-mitsuboshi
> 一文字三つ星: a thick horizontal bar above three solid circles arranged in a downward
> triangle, printed in paper white (#f2ede4) with heavy charcoal (#2a251c) sumi-ink
> outlines so it reads on cream paper. Square composition.

## 2. Calligraphy

Sumi-ink black only. The two characters are stacked **top to bottom**, the same brush
weight for all four clans so the ribbons match.

**`kanji-takeda.png`** (portrait 512×1024)
> [directive] Japanese calligraphy of the two characters 武田 written vertically, 武 above
> 田, in gyōsho semi-cursive brush script with dry-brush edges and a single confident
> stroke weight, pure sumi-ink black, no seal, no other marks. Portrait composition, the
> characters filling the height.

**`kanji-uesugi.png`** — same prompt with 上杉 (上 above 杉).
**`kanji-oda.png`** — same prompt with 織田 (織 above 田).
**`kanji-mori.png`** — same prompt with 毛利 (毛 above 利).

**`kanji-ninja.png`** (square)
> [directive] Japanese calligraphy of the single character 忍 in bold gyōsho brush
> script with dry-brush edges, pure sumi-ink black, no seal, no other marks. Square
> composition, the character filling the canvas.

## 3. Court figures — one figure per clan

Three compositions, each printed four times with the clan variables swapped. Keep the
pose, the crop (half body, waist up, facing slightly left) and the line weight identical
across clans; only the **lacquer colour**, the **crest** and the noted attribute change.
Faces are stylised ukiyo-e faces, calm. Bottom edge is a clean horizontal cut (the UI
anchors the figure to the bottom of its box).

Clan variables:
- Takeda — armour lacquered vermilion (#c0392b), the Takeda-bishi four-diamond crest.
- Uesugi — armour lacquered indigo (#2e6fd1), the Uesugi bamboo-and-sparrows crest.
- Oda — armour lacquered gold-ochre (#e0b322), the Oda mokkō flower crest.
- Mōri — armour lacquered white (#f2ede4) with charcoal cords, the Mōri bar-and-three-stars crest.

**`court-{clan}-jack.png`** (portrait 1024×1280)
> [directive] A Sengoku-era ashigaru foot soldier, half body from the waist up, facing
> slightly left, a yari spear resting over his right shoulder, a tall sashimono back-banner
> rising behind him bearing the {crest}, a simple jingasa hat and lamellar dō armour
> lacquered {colour}, cords in charcoal. Stylised ukiyo-e face. Portrait composition, the
> figure cut cleanly at the waist along the bottom edge.

**`court-{clan}-queen.png`** (portrait 1024×1280)
> [directive] A Sengoku-era onna-musha woman warrior, half body from the waist up, facing
> slightly left, a naginata held upright in her right hand, long black hair tied back with
> a {colour} cord, a breastplate lacquered {colour} bearing the {crest} on the chest, a
> white under-kimono. Stylised ukiyo-e face. Portrait composition, the figure cut cleanly
> at the waist along the bottom edge.

**`court-{clan}-king.png`** (portrait 1024×1280)
> [directive] A Sengoku-era daimyō, half body from the waist up, standing squarely and
> facing slightly left, full ō-yoroi armour and a horned kabuto helmet lacquered {colour},
> the gunbai war fan bearing the {crest} raised in his right hand, his left hand resting on
> the hilt of his katana, a thin moustache, stern stylised ukiyo-e face. Portrait
> composition, the figure cut cleanly at the waist along the bottom edge.

## 4. Ace halo

**`ace-halo.png`** (square)
> [directive] A radiant sunburst ring in gold leaf (#c9a24d): a ring of tapered rays around
> an EMPTY circular centre, with two small stylised ukiyo-e cloud bands (kumo) crossing the
> lower rays, fine black sumi-ink outlines, subtle darker gold shading on alternate rays.
> The centre of the ring must be completely transparent. Square composition.

## 5. Ninjas

These are the two unique cards in the deck; they may be richer than the court figures but
must keep the same ink line weight.

**`ninja-wood.png`** (portrait 1024×1536)
> [directive] A ninja crouched on a gnarled pine branch, full figure, walnut-brown
> (#6b4f2a) shinobi shōzoku with the face masked, only the eyes showing, a kunai held low
> in the right hand, the branch and a few pine needles in charcoal and dull green under
> him. Portrait composition, full figure, nothing behind the figure.

**`ninja-jade.png`** (portrait 1024×1536)
> [directive] A ninja mid-leap, full figure, jade-green (#1f7a4d) shinobi shōzoku with the
> face masked, only the eyes showing, a drawn straight ninjatō sword in the right hand,
> the scarf tails and a few shuriken trailing in the air. Portrait composition, full
> figure, nothing behind the figure.

## 6. Advantage seal

**`seal-advantage.png`** (square)
> [directive] A vermilion hanko seal impression, square with slightly rounded corners,
> reading the single character 勢 in tensho seal script, the vermilion ink (#d9442b)
> slightly uneven and broken at the edges as a real stamp would be, the character left as
> transparent negative space. Square composition.

## 7. Textures

Both tiles are **seamless**. The script mirror-tiles them (2×2 flip) so a small seam
does not matter, but avoid any large single feature.

**`paper-grain.png`** (square, seamless)
> [directive] A seamless tileable washi paper texture: faint long fibres, small mottled
> patches and a few flecks, drawn in a warm sepia-grey at low opacity on a fully
> transparent background so it can be laid over cream paper — no colour fill, no visible
> edges, no repeating feature.

**`back-pattern.png`** (square, seamless)
> [directive] A seamless tileable seigaiha (blue-ocean-wave) pattern of overlapping
> concentric scallops, drawn as fine gold-leaf (#c9a24d) lines on a fully transparent
> background, no fill inside the scallops, evenly spaced so the tile repeats without a
> seam.

## 8. Back emblem

**`back-emblem.png`** (square)
> [directive] A round lacquer-red roundel with a brushed gold-leaf (#c9a24d) ring, the
> single character 戦 in bold gold gyōsho brush script filling the centre, a faint darker
> ring of ink brush texture around the rim. Square composition, the roundel filling the
> canvas.

---

## Optional, later

**`corner-ornament.png`** (square)
> [directive] A small ink corner flourish: one L-shaped brushed sumi-ink ornament of a
> stylised cloud scroll fitting the top-left corner of a square, thin lines, nothing else.
> Square composition, the ornament touching the top and left edges.
