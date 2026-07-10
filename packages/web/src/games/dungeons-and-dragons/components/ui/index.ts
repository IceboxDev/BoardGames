// The DM tool's local primitives. These wrap the amber-gradient "parchment"
// look that is specific to this game and must NOT leak into the global
// components/ui/ design system — see DndPanel's header comment.
//
// WORD pills ("Module", "Granted", an NPC's kind) use the GLOBAL `Badge` from
// components/ui — do not re-invent them here. `StatPill` exists only because
// Badge letter-spaces and uppercases, which mangles "AC 15". Likewise
// `SectionEyebrow` is this tool's smaller, bolder kicker, distinct from the
// global `Eyebrow`; both header comments explain why.
export { AbilityGrid } from "./AbilityGrid";
export { DndPanel, type DndPanelPadding, type DndPanelTone } from "./DndPanel";
export { HeroBanner } from "./HeroBanner";
export { ReadAloudPanel } from "./ReadAloudPanel";
export { SectionEyebrow } from "./SectionEyebrow";
export { StatPill, type StatPillTone } from "./StatPill";
export { Vital } from "./Vital";
