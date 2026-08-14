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
//   - tracking:       tracking-label / -pill / -eyebrow
//   - shadow:         shadow-glow-*
//   - z-index:        z-nav / z-overlay / z-modal / z-tooltip / z-takeover
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["2xs", "3xs", "4xs", "5xs", "6xs", "7xs"] }],
      tracking: [{ tracking: ["label", "pill", "eyebrow", "code"] }],
      shadow: [{ "shadow-glow": ["accent", "amber", "sky", "emerald", "rose", "cyan"] }],
      z: [{ z: ["nav", "overlay", "modal", "tooltip", "takeover"] }],
    },
  },
});

type ClassValue = string | false | null | undefined;

/** Merge class fragments, dropping falsy values and resolving Tailwind conflicts last-wins. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(inputs.filter(Boolean).join(" "));
}
