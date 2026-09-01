import { INACTIVE_AFTER_DAYS } from "@boardgames/core/availability/inactivity";
import { ChevronDownIcon } from "../icons";

/** Keep in sync with UserRow.COLUMN_COUNT / the <UsersTable> header cells. */
const COLUMN_COUNT = 6;

type Props = {
  count: number;
  expanded: boolean;
  onToggle: () => void;
};

/**
 * The barely-there expander at the foot of the admin users table: a muted
 * "Show N inactive players" text row that reveals the archived rows inline,
 * in the SAME table, continuing the same sort direction (stalest last).
 * Deliberately not a Chip/Button — the archived list shouldn't carry more
 * visual weight than a footnote.
 */
export function InactiveToggleRow({ count, expanded, onToggle }: Props) {
  return (
    <tr>
      <td colSpan={COLUMN_COUNT} className="px-5 py-2">
        {/* biome-ignore lint/correctness/noRestrictedElements: bespoke text expander — deliberately quieter than any Button/Chip variant */}
        <button
          type="button"
          onClick={onToggle}
          title={`At 0% availability for ${INACTIVE_AFTER_DAYS}+ days — they return on any new mark, RSVP, or recorded match`}
          className="-mx-1 flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-2xs text-fg-muted transition-colors hover:text-fg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        >
          <ChevronDownIcon
            className={`h-3 w-3 transition-transform ${expanded ? "" : "-rotate-90"}`}
          />
          {expanded ? "Hide" : "Show"} {count} inactive player{count === 1 ? "" : "s"}
        </button>
      </td>
    </tr>
  );
}
