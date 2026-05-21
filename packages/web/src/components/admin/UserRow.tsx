import type { Coverage } from "../../pages/admin-coverage";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { CoverageCell } from "./CoverageCell";
import { InventoryPanel } from "./InventoryPanel";
import type { AdminUser } from "./types";

/** Match the number of `<th>` cells in the parent <UsersTable> header. */
const COLUMN_COUNT = 7;

export type UserRowProps = {
  user: AdminUser;
  coverage: Coverage;
  /** Inventory expansion (renders a second `<tr>` with the editor). */
  expanded: boolean;
  onToggleInventory: () => void;
  /** Online toggle. `pending` greys the switch while the mutation is in flight. */
  onToggleOnline: () => void;
  pending: boolean;
  /** Calendar drawer trigger. */
  onOpenCalendar: () => void;
  /** Delete mode is a page-level switch — when on, the Online column shows
   *  a Delete chip instead of the iOS switch and the row can drop into the
   *  email-confirm sub-row.
   *
   *  `isSelf` prevents an admin from deleting their own account. */
  deleteMode: boolean;
  isSelf: boolean;
  confirmingDelete: boolean;
  confirmEmail: string;
  onConfirmEmailChange: (next: string) => void;
  onStartDelete: () => void;
  onCancelDelete: () => void;
  onCommitDelete: () => void;
  deleting: boolean;
};

/**
 * One row in the admin users table. Renders up to three table rows: the main
 * row, an inventory expansion when open, and a delete-confirmation row when
 * the admin has started a delete. The fragment-of-trs shape lets the parent
 * `<tbody>` apply its divider styling between users without each user
 * needing its own DOM-invalid wrapping element.
 */
export function UserRow({
  user,
  coverage,
  expanded,
  onToggleInventory,
  onToggleOnline,
  pending,
  onOpenCalendar,
  deleteMode,
  isSelf,
  confirmingDelete,
  confirmEmail,
  onConfirmEmailChange,
  onStartDelete,
  onCancelDelete,
  onCommitDelete,
  deleting,
}: UserRowProps) {
  return (
    <>
      <tr className="h-12 text-gray-200">
        <td className="pl-5 pr-3 py-3">
          <CoverageCell coverage={coverage} />
        </td>
        <td className="px-5 py-3 font-medium">{user.name || "—"}</td>
        <td className="px-5 py-3 text-gray-400">{user.email}</td>
        <td className="px-5 py-3 text-center">
          <RoleBadge role={user.role ?? null} />
        </td>
        <td className="px-5 py-3 text-center">
          <Button variant="secondary" size="xs" onClick={onOpenCalendar}>
            View
          </Button>
        </td>
        <td className="px-5 py-3 text-center">
          <Chip pressed={expanded} tone="accent" size="xs" onClick={onToggleInventory}>
            {expanded ? "Close" : "Manage"}
          </Chip>
        </td>
        <td className="px-5 py-3 text-center">
          <DeleteOrOnlineCell
            deleteMode={deleteMode}
            isSelf={isSelf}
            confirmingDelete={confirmingDelete}
            onStartDelete={onStartDelete}
            onlineEnabled={Boolean(user.onlineEnabled)}
            email={user.email}
            onToggleOnline={onToggleOnline}
            pending={pending}
          />
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={COLUMN_COUNT} className="bg-surface-950/50 px-4 py-4">
            <InventoryPanel userId={user.id} />
          </td>
        </tr>
      )}
      {confirmingDelete && (
        <tr>
          <td
            colSpan={COLUMN_COUNT}
            className="border-t border-rose-500/30 bg-rose-950/40 px-4 py-4"
          >
            <DeleteConfirm
              email={user.email}
              confirmEmail={confirmEmail}
              onConfirmEmailChange={onConfirmEmailChange}
              onCancelDelete={onCancelDelete}
              onCommitDelete={onCommitDelete}
              deleting={deleting}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function RoleBadge({ role }: { role: string | null }) {
  const isAdmin = role === "admin";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${
        isAdmin ? "bg-accent-500/20 text-accent-300" : "bg-white/5 text-gray-400"
      }`}
    >
      {role ?? "user"}
    </span>
  );
}

type DeleteOrOnlineProps = {
  deleteMode: boolean;
  isSelf: boolean;
  confirmingDelete: boolean;
  onStartDelete: () => void;
  onlineEnabled: boolean;
  email: string;
  onToggleOnline: () => void;
  pending: boolean;
};

/**
 * Last column of the row. When delete mode is on, shows either the Delete
 * chip, a "Confirm below…" hint while the confirm sub-row is open, or an
 * inert "you" pill for the current admin (can't delete themselves). When
 * delete mode is off, shows the iOS-style online toggle.
 */
function DeleteOrOnlineCell({
  deleteMode,
  isSelf,
  confirmingDelete,
  onStartDelete,
  onlineEnabled,
  email,
  onToggleOnline,
  pending,
}: DeleteOrOnlineProps) {
  return (
    <div className="flex h-6 items-center justify-center">
      {deleteMode ? (
        isSelf ? (
          <span
            className="inline-flex h-6 items-center rounded-md border border-white/5 bg-white/5 px-2.5 text-xs italic text-gray-500"
            title="You cannot delete yourself"
          >
            you
          </span>
        ) : confirmingDelete ? (
          <span className="inline-flex h-6 items-center text-xs text-rose-300">Confirm below…</span>
        ) : (
          <Chip pressed tone="rose" size="xs" ring={false} onClick={onStartDelete}>
            Delete
          </Chip>
        )
      ) : (
        <OnlineToggle
          enabled={onlineEnabled}
          email={email}
          onToggle={onToggleOnline}
          pending={pending}
        />
      )}
    </div>
  );
}

type OnlineToggleProps = {
  enabled: boolean;
  email: string;
  onToggle: () => void;
  pending: boolean;
};

/**
 * iOS-style track-and-thumb switch. Intentionally not a labeled `<Button>` —
 * the on/off state is the entire affordance.
 */
function OnlineToggle({ enabled, email, onToggle, pending }: OnlineToggleProps) {
  return (
    // biome-ignore lint/correctness/noRestrictedElements: track+thumb toggle widget, not a labeled button
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
        enabled ? "bg-accent-500" : "bg-surface-700"
      } ${pending ? "opacity-50" : ""}`}
      aria-pressed={enabled}
      aria-label={`Toggle online for ${email}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

type DeleteConfirmProps = {
  email: string;
  confirmEmail: string;
  onConfirmEmailChange: (next: string) => void;
  onCancelDelete: () => void;
  onCommitDelete: () => void;
  deleting: boolean;
};

/**
 * Email-typing confirmation row. The admin has to type the user's exact
 * email (case-insensitive) before the destructive button enables — same
 * pattern GitHub uses for repo deletion.
 */
function DeleteConfirm({
  email,
  confirmEmail,
  onConfirmEmailChange,
  onCancelDelete,
  onCommitDelete,
  deleting,
}: DeleteConfirmProps) {
  const confirmReady = confirmEmail.trim().toLowerCase() === email.toLowerCase();
  return (
    <div className="space-y-3">
      <p className="text-sm text-rose-100">
        Type{" "}
        <span className="rounded bg-rose-500/20 px-1.5 py-0.5 font-mono text-xs text-rose-100">
          {email}
        </span>{" "}
        to confirm permanent deletion.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          // biome-ignore lint/a11y/noAutofocus: focus on the active confirmation input
          autoFocus
          value={confirmEmail}
          onChange={(e) => onConfirmEmailChange(e.target.value)}
          placeholder={email}
          disabled={deleting}
          spellCheck={false}
          autoComplete="off"
          className="w-full flex-1 rounded-md border border-rose-500/30 bg-surface-950 px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:border-rose-400 focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancelDelete} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onCommitDelete}
            disabled={!confirmReady || deleting}
            loading={deleting}
          >
            Delete user
          </Button>
        </div>
      </div>
    </div>
  );
}
