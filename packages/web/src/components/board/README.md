# Board primitives

Declarative SVG primitives for intricate-board games (maps, instrument panels,
hex grids, dungeons). The standard for the repo as of 2026-05.

Card-style games (Lost Cities, Exploding Kittens, Durak, etc.) keep using
plain React DOM. They don't need this.

See `docs/intricate-board-rendering.md` for the decision record and escape-
hatch criterion (TL;DR: SVG by default, canvas only for >500 simultaneous
interactive elements, react-three-fiber deferred).

## Mental model

A board is one SVG surface with a fixed `viewBox`. Everything geometric lives
inside the SVG. Text-heavy HUDs (status readouts, mug rows, dropdowns) live
in absolute-positioned HTML `<div>`s rendered as siblings via `<BoardOverlay>`.

```tsx
<BoardSurface
  viewBox={{ x: 0, y: 0, width: 720, height: 1000 }}
  aria-label="Sky Team cockpit"
  className="w-full max-w-[720px] aspect-[720/1000]"
  overlays={
    <>
      <BoardOverlay at={{ x: 80, y: 60 }} anchor="center">
        <div className="rounded-lg bg-slate-800/80 px-3 py-1 text-sm">6000 ft</div>
      </BoardOverlay>
    </>
  }
>
  <BoardLayer name="background" z={0}> ... </BoardLayer>
  <BoardLayer name="instruments" z={1}>
    <BoardArc center={{ x: 360, y: 320 }} radius={200} startDeg={200} endDeg={340} />
    <BoardSlot bounds={...} variant="pilot" onSelect={...}> ... </BoardSlot>
  </BoardLayer>
</BoardSurface>
```

`BoardSurface` auto-injects the shared slot-fill gradient `<defs>` and
publishes per-instance gradient IDs through context — you don't manage them.

Geometry constants belong in a per-game `geometry.ts` file. Don't put numeric
coordinates anywhere else.

## Primitives

### `<BoardSurface>` — root

Owns the `<svg>` and a `ResizeObserver`. Publishes `viewBox`, surface pixel
size, and `toScreen` / `toLocal` helpers through context. Size the *parent*
element via Tailwind (`w-full max-w-[720px] aspect-[720/1000]`).

```tsx
<BoardSurface
  viewBox={{ x: 0, y: 0, width: 720, height: 1000 }}
  aria-label="Sky Team cockpit"
  className="w-full max-w-[720px] aspect-[720/1000]"
>
  ...
</BoardSurface>
```

### `<BoardLayer name z?>` — `<g>` wrapper

DOM-order paints. The `z` prop is documentation, not enforcement. Place layers
in the order you want them drawn. `name` renders as `data-layer="…"` for
DevTools-friendly debugging.

### `<BoardSlot bounds variant onSelect …>` — interactive region

Renders a tappable + keyboard-focusable rect with a focus ring. Pointer click,
Enter, and Space all collapse to one `onSelect`. Variants: `"pilot"`,
`"copilot"`, `"neutral"`, `"mixed"`, `"system"`. Variant gradient `<defs>` are
injected automatically by `<BoardSurface>` with per-instance IDs.

```tsx
<BoardSlot
  bounds={{ x: 300, y: 540, w: 70, h: 70 }}
  variant="pilot"
  selectable={canPlace("pilot-engine")}
  selected={!!view.slots["pilot-engine"].die}
  aria-label="Pilot engine slot"
  onSelect={() => onSelectSlot("pilot-engine")}
>
  <text x={335} y={580} textAnchor="middle" fill="white">Engine</text>
</BoardSlot>
```

### `<BoardArc center radius startDeg endDeg labels?>` — curved band + labels

Built on `<path>` + `<textPath>`. Labels accept positions along the arc as
`0..1` floats.

```tsx
<BoardArc
  center={{ x: 360, y: 320 }}
  radius={200}
  startDeg={200}
  endDeg={340}
  thickness={28}
  labels={[
    { at: 0.0, text: "2" },
    { at: 0.1, text: "3" },
    // ...
    { at: 1.0, text: "12" },
  ]}
/>
```

### `<BoardOverlay at anchor? width? height?>` — HTML island

Renders an absolute-positioned `<div>` whose anchor lives at a viewBox coord.
The HTML scales with the board because width/height are expressed in viewBox
units.

```tsx
<BoardOverlay at={{ x: 60, y: 50 }} anchor="center" width={120}>
  <div className="rounded-full bg-slate-800/80 px-2 py-1 text-xs text-white">
    Reroll
  </div>
</BoardOverlay>
```

### Animation presets — `motion.ts`

```ts
import { boardSpring, boardEase, pulseRingAnimation, pulseRingTransition } from "...";

<motion.g initial={false} animate={{ x, y }} transition={boardSpring} />
```

Respect reduced motion via framer-motion's `useReducedMotion()` — call it in
your component and gate transitions to `{ duration: 0 }` when true.

### Keyboard navigation — `useArrowKeyNavigation(adjacency)`

Pass a 2D adjacency map keyed by slot id. Attach the returned handler to a
wrapper element under which slot elements expose `data-slot-id="…"`.

```ts
const onKeyDown = useArrowKeyNavigation<SlotId>({
  "pilot-axis":   { right: "pilot-engine",  down: "pilot-radio" },
  "pilot-engine": { left: "pilot-axis",     down: "landing-gear-1" },
  // ...
});
```

### Path helpers — `svg-paths.ts`

`arcPath(from, to, radius, sweep?, large?)`, `arcPathFromCenter(center, radius, startDeg, endDeg)`,
`roundedRect(x, y, w, h, r)`, `polyline(points)`. Use these when you need a
custom `<path d>` that the primitives don't already cover.

## Conventions

- **`viewBox` per game.** Fix one aspect ratio and freeze it. Sky Team uses
  `720 × 1000`. Pick once per game and never change.
- **Geometry lives in `geometry.ts`.** All numeric coordinates in one typed
  record per game. No magic numbers in components.
- **Hit-testing is DOM events.** Click handlers on `<BoardSlot>` and nothing
  else. Set `pointer-events: none` on decorative siblings that overlap a slot.
- **Decorative `<g>`s get `aria-hidden`.** Only interactive regions should be
  focusable / labelled.
- **HTML overlays default to `<div>`, not `<foreignObject>`.** Safari clips
  and breaks focus rings on `<foreignObject>`; sidestep it.

## When to reach for canvas instead

If you have >500 simultaneous interactive elements (heavy maps with thousands
of tokens, particle effects) the SVG DOM cost will dominate. File an issue
before going there; the canvas engine in `packages/web/src/engine/` is frozen
and Pandemic is the only game allowed to use it until that's revisited.
