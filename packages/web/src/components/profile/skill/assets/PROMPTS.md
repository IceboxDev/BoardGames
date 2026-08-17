# Showcase-card background art

Nine wide backgrounds for the stats page's hero cards. Drop the generated
images in this folder with the exact filenames below (webp preferred,
**16:9, ~1600×900**) — `skill-card-art.ts` picks them up automatically;
missing files fall back to the accent glow.

Why 16:9 and not wider: the cards render anywhere from ~2.4:1 (desktop
3-column) to ~2.2:1 (phone full-width) and use `object-cover`, so a 16:9
source keeps vertical latitude for the crop at every breakpoint; an ultra-wide
source would run out of height on phones. The bottom-left corner carries the
title text and the bottom-right corner carries the trophy / score ring — keep
BOTH lower corners dark and uncluttered, and put the subject in the upper half.

**Shared style block (append to every prompt):** Moody dark-navy board-game
illustration, deep #0a0c14 background, cinematic rim lighting, subtle indigo
(#6366f1) glow accents, painterly semi-realistic style, 16:9 composition with
the subject in the UPPER half and both lower corners dark and uncluttered
(text and a trophy sit there), no text, no letters, no people's faces in
focus, atmospheric depth of field.

| File | Prompt (prepend to the shared style block) |
|---|---|
| `bg-int.webp` | A glowing glass chess knight mid-move above a faint grid of branching decision lines, tiny math constellations in the dark air |
| `bg-pln.webp` | A winding luminous route across a stylized dark strategy map, waypoint flags and route markers receding to the horizon |
| `bg-per.webp` | A magnifying lens hovering over scattered dark game tiles, one tile glowing where a hidden pattern lines up, faint concentric scan rings |
| `bg-soph.webp` | An open ancient tome with glowing letterforms drifting off the page into the dark, stacked leather books in soft shadow |
| `bg-soc.webp` | Silhouetted player pieces around a card table leaning toward each other, one piece holding a glowing hidden card, speech-line motifs in the gloom |
| `bg-dex.webp` | A wooden dexterity tower mid-flick with a balanced stack of discs, motion streaks frozen at the moment of a precise strike |
| `bg-claim-gold.webp` | A golden laurel wreath and confetti embers over a dark podium's first-place step, warm gold rim light |
| `bg-claim-silver.webp` | A silver laurel wreath over the second step of a dark podium, cool moonlit silver rim light |
| `bg-claim-bronze.webp` | A bronze laurel wreath over the third step of a dark podium, ember-orange rim light |
| `bg-claim-streak.webp` | A comet of stylized flame streaking across a dark table scattering embers over game pieces, fiery orange rim light |
| `bg-claim-winrate.webp` | A rising column of glowing victory chips stacking ever higher over a dark felt table, a small upward arrow motif in embers |
| `bg-claim-coop.webp` | Four stylized meeples shoulder to shoulder lifting one glowing star together, warm united glow on a dark board |
| `bg-claim-form.webp` | A dark scoreboard whose last few tally marks burn bright and hot, heat-shimmer rising off the freshest mark |
| `bg-claim-variety.webp` | A sprawling dark atlas of many tiny glowing board-game boards fanned out like constellation cards, one lantern lighting them |
| `bg-claim-dedication.webp` | A well-worn wooden game table under a warm lamp, dice and sleeves showing years of loving use, quiet steady glow |
