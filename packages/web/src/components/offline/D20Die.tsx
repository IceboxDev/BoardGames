import { useId } from "react";

// A 2D d20 (icosahedron) rendered as its classic point-up silhouette: a
// hexagon split into a central triangular face plus six surrounding facets,
// each shaded a different crimson so the solid reads as a cut gem lit from the
// top-left. The participant count sits on the face in gold. Pure SVG in a
// 100×100 viewBox — scales fluidly; the caller sizes it via `className`.
//
// Geometry (precomputed, center 50,50): outer hexagon radius 47, central
// up-triangle radius 22. The three triangle vertices point at alternating
// hexagon corners (spokes); the three edges face the other corners (kites).

const FACETS: { points: string; fill: string }[] = [
  // Top kite (catches the most light) → brightest.
  { points: "50,28 90.7,26.5 50,3 9.3,26.5", fill: "#f87171" },
  // Upper-left facet.
  { points: "30.95,61 9.3,26.5 50,28", fill: "#ef4444" },
  // Upper-right facet.
  { points: "50,28 90.7,26.5 69.05,61", fill: "#dc2626" },
  // Lower-left kite.
  { points: "30.95,61 9.3,26.5 9.3,73.5 50,97", fill: "#991b1b" },
  // Lower-right kite.
  { points: "69.05,61 90.7,26.5 90.7,73.5 50,97", fill: "#7f1d1d" },
  // Bottom facet (deepest shadow).
  { points: "69.05,61 50,97 30.95,61", fill: "#641212" },
  // Central face (number lives here) — drawn last so its edges sit on top.
  { points: "50,28 69.05,61 30.95,61", fill: "#b91c1c" },
];

// Every facet edge, stroked thin in gold so the cut catches light.
const EDGES = "M50,3 L90.7,26.5 90.7,73.5 50,97 9.3,73.5 9.3,26.5 Z";
const SPOKES =
  // central triangle + the three vertex spokes to the hexagon corners
  "M50,28 L69.05,61 30.95,61 Z M50,28 L50,3 M69.05,61 L90.7,73.5 M30.95,61 L9.3,73.5";

type Props = {
  /** Number shown on the die face — the night's confirmed party size. */
  count: number;
  /** Sizing (width/height) + any glow, e.g. "h-16 w-16". */
  className?: string;
};

export function D20Die({ count, className }: Props) {
  const id = useId();
  const digits = String(count).length;
  const fontSize = digits <= 1 ? 34 : digits === 2 ? 26 : 18;
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={`${count} ${count === 1 ? "adventurer" : "adventurers"}`}
    >
      <defs>
        {/* Top-left sheen overlay — a soft white highlight that sells the
            polished-gem look across the whole solid. */}
        <radialGradient id={`${id}-sheen`} cx="35%" cy="28%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {FACETS.map((f) => (
        <polygon key={f.points} points={f.points} fill={f.fill} />
      ))}

      {/* Sheen sits above the facet fills but below the gold edges + number. */}
      <polygon
        points="50,3 90.7,26.5 90.7,73.5 50,97 9.3,73.5 9.3,26.5"
        fill={`url(#${id}-sheen)`}
      />

      {/* Inner facet edges (thin) then the outer rim (bright). */}
      <path d={SPOKES} fill="none" stroke="#fde68a" strokeOpacity="0.4" strokeWidth="0.9" />
      <path
        d={EDGES}
        fill="none"
        stroke="#fcd34d"
        strokeOpacity="0.95"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      <text
        x="50"
        y="51"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight={800}
        fill="#fde68a"
        stroke="#4a0a0a"
        strokeWidth="1.1"
        paintOrder="stroke"
        style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
      >
        {count}
      </text>
    </svg>
  );
}
