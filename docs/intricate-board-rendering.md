# Intricate board rendering

This is the decision record for how games with non-card-style spatial layouts
(maps, instrument panels, hex grids, dungeons) are rendered in this repo.

**Status**: adopted 2026-05-20.
**Authors**: the team.

## Decision

Use **declarative SVG + React + framer-motion** as the default for every
intricate-board game from now on.

- SVG `<viewBox>` is the coordinate system.
- Each interactive region is a real DOM node (focusable, ARIA-labelable).
- Animations are declarative through framer-motion (`<motion.g animate={…}>`).
- HTML overlays (`<BoardOverlay>`) handle text-heavy widgets that don't fit
  inside a pure SVG layout.
- Shared primitives live at `packages/web/src/components/board/` — see
  [its README](../packages/web/src/components/board/README.md) for the API.

Card-style games (Lost Cities, Exploding Kittens, Durak, Sushi Go, …) keep
using plain React DOM. They don't have spatial complexity that warrants the
extra ceremony.

## Why not …

### Canvas 2D (Pandemic's approach)

Pandemic is the only canvas game in the repo today and it carries about
1,475 LOC of rendering plumbing in `packages/web/src/games/pandemic/rendering/`:
a custom `GameRenderer`, layer system, camera, hit-test, AnimationQueue (dead
code — never wired), and ad-hoc sprite atlas loading. Coordinates are
hard-coded pixels in a 1920×1080 reference plane. The canvas surface is
opaque to screen readers and keyboard navigation.

A canvas approach made sense in 2014 when SVG performance was unreliable;
in 2026 it isn't competitive on developer ergonomics. Replicating that
amount of code for every future intricate-board game would be a long-term
liability.

**Pandemic stays on canvas in this PR — see "exceptions" below.**

### react-three-fiber / WebGL

Overkill for flat 2D instrument panels. Ships a WebGL context per game (~120
kB gz minimum on @react-three/fiber + three.js peerDeps), and accessibility
on canvas surfaces is its own project. Useful when a game genuinely needs 3D
(card flips with depth, perspective dioramas) — defer until then.

### @pixi/react / Pixi 2D

Same accessibility blackhole as canvas. WebGL acceleration buys speed we
don't need for ≤500-node boards. Reach for it only if SVG's perf ceiling is
hit.

### "Just keep Pandemic-style canvas, extract better primitives"

The cost lives in the *model* (imperative immediate-mode rendering), not the
layer count. Better primitives would shave a few hundred LOC without fixing
the accessibility gap or the dead AnimationQueue. SVG is the right default;
canvas is an escape hatch.

## Exceptions / escape hatch

You may keep or introduce canvas rendering **only** if:

1. You have **more than ~500 simultaneous interactive nodes** that the SVG
   DOM cost would dominate (e.g. a heavy hex map with thousands of unit
   tokens, particle effects).
2. You've benchmarked SVG and confirmed the bottleneck.
3. You've filed a tracking issue documenting the call.

Pandemic's existing `packages/web/src/games/pandemic/rendering/*` and the
shared `packages/web/src/engine/` are **frozen** under this exception — no
new games are allowed to adopt them. A follow-up port of Pandemic to SVG is
recommended but out of this PR's scope; track it as a separate item once
Sky Team's primitives have been in production for ~2 weeks.

## Sky Team is the reference port

The first intricate-board game ported to SVG is Sky Team, in
`packages/web/src/games/sky-team/components/board/`. Look there for:

- A complete tree of `<BoardSurface>` + layers + overlays.
- `geometry.ts` — the only file with numeric coordinates.
- `CockpitSlot.tsx` — the per-game wrapper around `<BoardSlot>`.

The visual source of truth lives in `sky-team-lab/` (a build-free HTML+CSS
sketch). The React port must visually track the lab; iterate the lab first
when designing new regions, then mirror in React.

## Verification workflow for intricate-board games

When porting or building a new intricate-board game:

1. Sketch the look in a build-free HTML+CSS chamber at `<game-slug>-lab/`
   first if the layout is novel.
2. Transcribe coordinates into `games/<slug>/components/board/geometry.ts`.
3. Use the primitives from `components/board/` to build region components.
4. Run `pnpm typecheck` / `pnpm lint` / `pnpm test` after each region.
5. Manually click-through the game end-to-end after the port is complete:
   the existing `core/` test suite covers game logic and is unaffected by
   the UI change.
6. Eyeball the React render side-by-side with the lab chamber at matching
   viewport widths. Tighten geometry constants until they match.
