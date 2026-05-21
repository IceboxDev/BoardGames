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

### Canvas 2D (Pandemic's original approach, since removed)

Pandemic originally shipped on Canvas 2D and carried about 1,700 LOC of
rendering plumbing — a custom `GameRenderer`, layer system, camera,
hit-test, AnimationQueue (dead code — never wired), and ad-hoc sprite
atlas loading. Coordinates were hard-coded pixels in a 1920×1080
reference plane. The canvas surface was opaque to screen readers and
keyboard navigation.

A canvas approach made sense in 2014 when SVG performance was unreliable;
in 2026 it isn't competitive on developer ergonomics. Pandemic has now
been ported to the SVG + React primitives this document recommends — see
`packages/web/src/games/pandemic/components/board/`. The canvas-era
`engine/` directory and `pandemic/rendering/` folder were removed in the
same change. Future canvas reintroduction requires the escape-hatch
criteria below.

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

No game in the repo currently uses canvas — the previous Pandemic
exception was retired when Pandemic was ported to SVG.

## Reference ports

Two games are now built on the SVG primitives:

**Sky Team** — `packages/web/src/games/sky-team/components/board/`. The
original port; demonstrates instrument-panel-style spatial layouts
(dials, arcs, asymmetric per-role slots).

**Pandemic** — `packages/web/src/games/pandemic/components/board/`.
Demonstrates network-style spatial layouts (cities, connections,
wrap-around routes, per-city stacks of cubes / pawns / stations) on a
1920×1080 reference plane.

Look at either for:

- A complete tree of `<BoardSurface>` + layers + overlays.
- `geometry.ts` — the only file with numeric coordinates.
- `CockpitSlot.tsx` — the per-game wrapper around `<BoardSlot>`.

A standalone iteration view lives at `packages/web/src/labs/sky-team/Lab.tsx`,
mounted at `/dev/sky-team-lab`. It renders the production `<Cockpit>` against
a mock `SkyTeamPlayerView`, so the lab and the live game share `geometry.ts`
by construction — no parallel coordinate system, no drift.

## Verification workflow for intricate-board games

When porting or building a new intricate-board game:

1. Add a lab route at `packages/web/src/labs/<slug>/Lab.tsx` that mounts the
   game's board component against a mock player view. Iterate there.
2. Put all numeric coordinates in `games/<slug>/components/board/geometry.ts`.
   Components import from it; never inline coordinates.
3. Use the primitives from `components/board/` to build region components.
4. Run `pnpm typecheck` / `pnpm lint` / `pnpm test` after each region.
5. Manually click-through the game end-to-end after the port is complete:
   the existing `core/` test suite covers game logic and is unaffected by
   the UI change.
