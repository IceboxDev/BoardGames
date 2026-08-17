import type { ReactNode } from "react";
import { EmptyState, LoadingState, Surface } from "../ui";

type Props = {
  /** When true, render the loading placeholder instead of the table. */
  loading: boolean;
  /** When the user list is empty (and not loading), render the empty state. */
  empty: boolean;
  /** Whether the Online column should switch its label to "Delete" + rose-tinted. */
  deleteMode: boolean;
  /** `<UserRow>` elements, one per visible user. */
  children: ReactNode;
};

/**
 * Tri-state table chrome: loading placeholder, empty placeholder, or the
 * users table itself. The parent passes `<UserRow>` children for the data
 * case; here we own the surrounding `<table>`, `<thead>`, and `<tbody>` so
 * `AdminPage` doesn't have to.
 *
 * Header columns are 6 wide; `UserRow.COLUMN_COUNT` must stay in sync (used
 * for the expansion / confirmation `colSpan`).
 */
export function UsersTable({ loading, empty, deleteMode, children }: Props) {
  if (loading) {
    return (
      <Surface variant="panel" padding="none">
        <LoadingState />
      </Surface>
    );
  }

  if (empty) {
    return <EmptyState title="No users yet" />;
  }

  return (
    <Surface variant="panel" padding="none" className="overflow-hidden">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-surface-800 text-xs uppercase tracking-wider text-fg-muted">
          {/* Phones deliberately show only Coverage + Name (both clickable —
              calendar and activity). The management columns need a desktop;
              horizontal table scrolling on touch is not a real affordance. */}
          <tr>
            <th className="w-24 pl-5 pr-3 py-3 text-left font-medium" aria-label="Coverage" />
            <th className="md:w-64 px-5 py-3 text-left font-medium">Name</th>
            <th className="hidden md:table-cell px-5 py-3 text-left font-medium">Email</th>
            <th className="hidden md:table-cell w-24 px-5 py-3 text-center font-medium">Role</th>
            <th className="hidden md:table-cell w-32 px-5 py-3 text-center font-medium">
              Inventory
            </th>
            <th
              className={`hidden md:table-cell w-40 px-3 py-3 text-center font-medium ${
                deleteMode ? "text-rose-300" : ""
              }`}
            >
              {deleteMode ? "Delete" : "Online"}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">{children}</tbody>
      </table>
    </Surface>
  );
}
