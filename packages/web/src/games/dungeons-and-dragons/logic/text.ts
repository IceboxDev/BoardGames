/** Escape a string for literal use inside a RegExp. */
// Lived twice — in EnrichedText (building the entity-name matcher) and in
// InitiativePanel (building the creature-count matcher). Same body both times.
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
