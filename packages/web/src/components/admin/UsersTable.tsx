import type { ReactNode } from "react";

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
 * Header columns are 7 wide; `UserRow.COLUMN_COUNT` must stay in sync (used
 * for the expansion / confirmation `colSpan`).
 */
export function UsersTable({ loading, empty, deleteMode, children }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface-900 px-6 py-10 text-center text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  if (empty) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-gray-500">
        No users yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-900">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-surface-800 text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th className="w-24 pl-5 pr-3 py-3 text-left font-medium" aria-label="Coverage" />
            <th className="w-64 px-5 py-3 text-left font-medium">Name</th>
            <th className="px-5 py-3 text-left font-medium">Email</th>
            <th className="w-24 px-5 py-3 text-center font-medium">Role</th>
            <th className="w-32 px-5 py-3 text-center font-medium">Calendar</th>
            <th className="w-32 px-5 py-3 text-center font-medium">Inventory</th>
            <th
              className={`w-32 px-5 py-3 text-center font-medium ${
                deleteMode ? "text-rose-300" : ""
              }`}
            >
              {deleteMode ? "Delete" : "Online"}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">{children}</tbody>
      </table>
    </div>
  );
}
