import { TRIVIAL_PURSUIT_WEDGES, type Wedge } from "@boardgames/core/history/trivial-pursuit";

// Trivial Pursuit's pie: six 60° slots in board order, filled in the wedge's
// colour when collected, a faint empty slot otherwise. The palette is the
// classic Genus board — game content, not chrome, so literal palette colours.

type WedgeStyle = { name: string; fill: string; bg: string; border: string };

export const WEDGE_STYLE: Record<Wedge, WedgeStyle> = {
  blue: { name: "Blue", fill: "fill-sky-500", bg: "bg-sky-500", border: "border-sky-500" },
  pink: { name: "Pink", fill: "fill-pink-400", bg: "bg-pink-400", border: "border-pink-400" },
  yellow: {
    name: "Yellow",
    fill: "fill-yellow-400",
    bg: "bg-yellow-400",
    border: "border-yellow-400",
  },
  brown: { name: "Brown", fill: "fill-amber-800", bg: "bg-amber-800", border: "border-amber-700" },
  green: { name: "Green", fill: "fill-green-500", bg: "bg-green-500", border: "border-green-500" },
  orange: {
    name: "Orange",
    fill: "fill-orange-500",
    bg: "bg-orange-500",
    border: "border-orange-500",
  },
};

const C = 12;
const R = 11;

function slicePath(i: number): string {
  const a0 = ((i * 60 - 90) * Math.PI) / 180;
  const a1 = (((i + 1) * 60 - 90) * Math.PI) / 180;
  const p = (a: number) =>
    `${(C + R * Math.cos(a)).toFixed(3)} ${(C + R * Math.sin(a)).toFixed(3)}`;
  return `M ${C} ${C} L ${p(a0)} A ${R} ${R} 0 0 1 ${p(a1)} Z`;
}

const SLICES = TRIVIAL_PURSUIT_WEDGES.map((_, i) => slicePath(i));

export function WedgePie({
  wedges,
  className = "h-4 w-4",
}: {
  wedges: readonly Wedge[];
  className?: string;
}) {
  const held = new Set(wedges);
  const label = `${held.size}/${TRIVIAL_PURSUIT_WEDGES.length} wedges`;
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} role="img" aria-label={label}>
      <title>{label}</title>
      {TRIVIAL_PURSUIT_WEDGES.map((w, i) => (
        <path
          key={w}
          d={SLICES[i]}
          className={`${held.has(w) ? WEDGE_STYLE[w].fill : "fill-fill-strong"} stroke-surface-900`}
          strokeWidth={1}
        />
      ))}
      <circle cx={C} cy={C} r={R} className="fill-none stroke-line-strong" strokeWidth={0.75} />
    </svg>
  );
}
