# Sky Team — Board Lab

Iteration chamber for the Sky Team cockpit board. Completely isolated
from `packages/web` — no React, no build, no bundler. Edit, refresh,
look at the picture, repeat.

## Open it

```
xdg-open sky-team-lab/index.html
```

Or just drag `index.html` into any browser. No server required.
If you want live-reload, `python -m http.server` in this folder also
works.

## Files

- `index.html` — board markup. Each cockpit region has its own
  semantic block (top HUD, side strips, center cluster, bottom panel).
- `board.css` — all styling. Tokens live at the top under `:root`;
  the rest is organized by region in the same order as the HTML.

## Tunable knobs

The big layout dials are CSS custom properties at the top of
`board.css`:

| Variable          | What it controls                              |
| ----------------- | --------------------------------------------- |
| `--board-w`       | Max board width                               |
| `--board-aspect`  | Frame aspect ratio (currently 720 / 1000)     |
| `--top-hud-h`     | Top HUD strip height (% of board height)      |
| `--bottom-h`      | Bottom panel height (% of board height)       |
| `--side-strip-w`  | Side strip width (% of board width)           |

The colour palette and shadow effects are below those, also in
`:root`.

## Debug overlay

Press `G` on the page to toggle a 5% magenta grid over the board —
useful for eyeballing alignment.

## Workflow

This is a sketch surface, not a component. We iterate here until the
layout looks right, then port it into
`packages/web/src/games/sky-team/components/` as proper React
components driven by the existing `SkyTeamPlayerView`.
