import { extendTailwindMerge } from "tailwind-merge";

// The single class-composition helper. Every `ui/` primitive (and any
// component that accepts a `className` escape hatch) joins its classes
// through this, so a caller's utility genuinely overrides the primitive's
// default instead of winning or losing by Tailwind's generated-CSS order.
// Before this existed, overrides worked "by numeric accident" (px-6 beat
// px-4 only because 6 > 4 in the output order) and three components carried
// doc-comment warnings not to fight their variants. The warnings are now
// obsolete: last-one-wins is guaranteed per CSS property group.
//
// Custom theme scales must be registered so twMerge knows the classes
// conflict with their stock groups (otherwise e.g. `text-2xs` + `text-sm`
// would both survive):
//   - font-size:      text-2xs … text-7xs   (index.css micro type scale)
//   - tracking:       tracking-label / -pill / -eyebrow / -code
//   - shadow:         shadow-glow-*
//   - z-index:        z-nav / z-overlay / z-modal / z-tooltip / z-takeover / z-raised(-2/-3)
//   - rounded:        rounded-card-* / rounded-ui-*   (index.css radius roles)
//   - aspect:         aspect-card, aspect-photo
//   - width/height:   the layout constants (w-board-rail, h-fan, …)
//   - max-width:      max-w-modal-full*
//
// Color tokens (`text-fg-strong`, `border-line`, `bg-fill`, …) need no entry:
// twMerge already treats any unknown `text-`/`border-`/`bg-` value as a color.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["2xs", "3xs", "4xs", "5xs", "6xs", "7xs"] }],
      tracking: [{ tracking: ["label", "pill", "eyebrow", "code"] }],
      shadow: [{ "shadow-glow": ["accent", "amber", "sky", "emerald", "rose", "cyan"] }],
      z: [
        {
          z: [
            "nav",
            "overlay",
            "modal",
            "tooltip",
            "takeover",
            "lift",
            "raised",
            "raised-2",
            "raised-3",
          ],
        },
      ],
      rounded: [
        { rounded: ["card-md", "card-lg", "card-xl", "card-2xl", "card-3xl", "ui-md", "ui-lg"] },
      ],
      "rounded-t": [{ "rounded-t": ["card-3xl"] }],
      aspect: [{ aspect: ["card", "photo"] }],
      w: [{ w: ["board-rail", "history-rail"] }],
      h: [{ h: ["nav", "fan"] }],
      "min-h": [{ "min-h": ["below-nav"] }],
      pt: [{ pt: ["nav"] }],
      top: [{ top: ["below-nav"] }],
      "max-w": [{ "max-w": ["modal-full", "modal-full-xl", "modal-full-2xl"] }],
    },
  },
});

type ClassValue = string | false | null | undefined;

/** Merge class fragments, dropping falsy values and resolving Tailwind conflicts last-wins. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(inputs.filter(Boolean).join(" "));
}
