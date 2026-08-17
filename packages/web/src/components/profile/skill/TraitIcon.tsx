import type { SkillTraitId } from "@boardgames/core/protocol";

// One glyph per skill trait — same stroke grammar as components/icons
// (20-viewBox, 1.6 stroke, round caps) so they sit beside them seamlessly.

const PATHS: Record<SkillTraitId, React.ReactNode> = {
  // Lightbulb — reasoning.
  int: (
    <>
      <path d="M10 3a5 5 0 0 1 5 5c0 1.9-1.1 3.1-2.1 4.1-.5.5-.9 1.2-.9 1.9h-4c0-.7-.4-1.4-.9-1.9C6.1 11.1 5 9.9 5 8a5 5 0 0 1 5-5Z" />
      <path d="M8.5 16.5h3" />
    </>
  ),
  // Waypoint flag — strategy across future turns.
  pln: (
    <>
      <path d="M5 17V3.5" />
      <path d="M5 4h9.5l-2.2 3.25L14.5 10.5H5" />
    </>
  ),
  // Eye — noticing what is there.
  per: (
    <>
      <path d="M2.5 10S5.5 5 10 5s7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5Z" />
      <circle cx="10" cy="10" r="2" />
    </>
  ),
  // Open book — knowledge and language.
  soph: (
    <>
      <path d="M10 5.2C8.5 3.9 6.3 3.6 4 4.2v11.6c2.3-.6 4.5-.3 6 1 1.5-1.3 3.7-1.6 6-1V4.2c-2.3-.6-4.5-.3-6 1Z" />
      <path d="M10 5.2v11.6" />
    </>
  ),
  // Two heads — operating through other people.
  soc: (
    <>
      <circle cx="7" cy="7" r="2.6" />
      <path d="M2.5 16.5c.5-3.2 2.4-4.8 4.5-4.8s4 1.6 4.5 4.8" />
      <circle cx="14.2" cy="8" r="2" />
      <path d="M13.2 16.5c.4-2.3 1.6-3.7 3-3.7 1 0 1.9.7 2.4 2" />
    </>
  ),
  // Target — physical precision.
  dex: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="3" />
      <circle cx="10" cy="10" r="0.5" fill="currentColor" />
    </>
  ),
};

export function TraitIcon({ trait, className }: { trait: SkillTraitId; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-4 w-4"}
      aria-hidden="true"
    >
      {PATHS[trait]}
    </svg>
  );
}
