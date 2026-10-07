import type { GroupDayMatch } from "@boardgames/core/availability/group-match";

// Words for "Find a date": how a night suits the picked group.

/** "Simon Kowalski" → "Simon"; how the calendar names people. */
export function firstName(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return "—";
  const space = trimmed.indexOf(" ");
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

/** "All 4 free · 1 maybe", "All but Simon", "Missing Simon, Ana", "2 of 5 free". */
export function fitLine(m: GroupDayMatch, names: ReadonlyMap<string, string>): string {
  const total = m.can.length + m.maybe.length + m.missing.length;
  const maybe = m.maybe.length > 0 ? ` · ${m.maybe.length} maybe` : "";
  const who = (ids: string[]) => ids.map((id) => firstName(names.get(id) ?? "—")).join(", ");
  if (total === 1)
    return m.missing.length > 0 ? "Not marked" : m.maybe.length > 0 ? "Maybe" : "Free";
  if (m.missing.length === 0) return `All ${total} free${maybe}`;
  if (m.missing.length === 1) return `All but ${who(m.missing)}${maybe}`;
  if (m.missing.length === 2) return `Missing ${who(m.missing)}${maybe}`;
  return `${m.can.length + m.maybe.length} of ${total} free${maybe}`;
}
