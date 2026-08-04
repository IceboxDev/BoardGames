// The shared card-face chrome formula. Sushi Go, Exploding Kittens, Durak and
// 7 Wonders each independently invented `{size} relative overflow-hidden
// rounded-* shadow-md transition-all ${ringClass} ${interactionClass}` — down
// to the same local variable names. The formula lives here once; the axes
// that legitimately differ per game (hover feel, glow color, extra skin
// classes) are parameters.
//
//   selected  — the universal "picked" treatment: white ring + pop.
//   glowClass — game-specific attention ring shown when NOT selected
//               (wasabi green, nope-window yellow pulse, defend emerald).
//   hover     — the clickable affordance: "scale" (pop), "lift" (translate up
//               + shadow), "shadow" (shadow only), or "none" for inert faces.
//   className — the face's own skin (bg, border, layout) — composition, not
//               an escape hatch.

type CardChromeOpts = {
  /** Game-specific size classes (w/h). */
  size?: string;
  rounded?: "lg" | "xl";
  selected?: boolean;
  glowClass?: string;
  disabled?: boolean;
  hover?: "scale" | "lift" | "shadow" | "none";
  className?: string;
};

const HOVERS: Record<NonNullable<CardChromeOpts["hover"]>, string> = {
  scale: "hover:scale-105 cursor-pointer",
  lift: "hover:-translate-y-1 hover:shadow-xl cursor-pointer",
  shadow: "hover:shadow-xl cursor-pointer",
  none: "",
};

export function cardChrome({
  size = "",
  rounded = "lg",
  selected = false,
  glowClass = "",
  disabled = false,
  hover = "scale",
  className = "",
}: CardChromeOpts): string {
  const ring = selected
    ? "ring-2 ring-white ring-offset-1 ring-offset-gray-900 scale-105"
    : glowClass;
  const interaction = disabled ? "opacity-50 cursor-default" : HOVERS[hover];
  return [
    size,
    "relative overflow-hidden shadow-md transition-all",
    rounded === "xl" ? "rounded-xl" : "rounded-lg",
    ring,
    interaction,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
