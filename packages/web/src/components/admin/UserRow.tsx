import type { OnlineMode } from "@boardgames/core/protocol";
import type { Coverage } from "../../pages/admin-coverage";
import { KeyIcon } from "../icons";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { IconButton } from "../ui/IconButton";
import { SegmentedControl } from "../ui/SegmentedControl";
import { CoverageCell } from "./CoverageCell";
import { InventoryPanel } from "./InventoryPanel";
import { ONLINE_MODE_OPTIONS_COMPACT } from "./online-mode-options";
import type { AdminUser } from "./types";

/** Match the number of `<th>` cells in the parent <UsersTable> header. */
const COLUMN_COUNT = 6;

export type UserRowProps = {
  user: AdminUser;
  coverage: Coverage;
  /** Inventory expansion (renders a second `<tr>` with the editor). */
  expanded: boolean;
  onToggleInventory: () => void;
  /** Online-mode picker. `pending` greys the control while the mutation is in flight. */
  onSetOnlineMode: (mode: OnlineMode) => void;
  pending: boolean;
  /** Calendar drawer trigger. */
  onOpenCalendar: () => void;
  /** Delete mode is a page-level switch — when on, the Online column shows
   *  a Delete chip instead of the mode picker and the row can drop into
   *  the email-confirm sub-row.
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
  /** Mint a one-time password-reset link for this user (admin relays it). */
  onResetPassword: () => void;
  resettingPassword: boolean;
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
  onSetOnlineMode,
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
  onResetPassword,
  resettingPassword,
}: UserRowProps) {
  return (
    <>
      <tr className="h-12 text-fg-primary">
        <td className="pl-5 pr-3 py-3">
          {/* biome-ignore lint/correctness/noRestrictedElements: bespoke clickable coverage pie — opens the user's availability calendar */}
          <button
            type="button"
            onClick={onOpenCalendar}
            aria-label={`View ${user.name || user.email}'s availability calendar`}
            className="-mx-1 cursor-pointer rounded-md px-1 py-0.5 transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            <CoverageCell coverage={coverage} />
          </button>
        </td>
        <td className="px-5 py-3 font-medium">{user.name || "—"}</td>
        <td className="px-5 py-3 text-fg-secondary">{user.email}</td>
        <td className="px-5 py-3 text-center">
          <RoleBadge role={user.role ?? null} />
        </td>
        <td className="px-5 py-3 text-center">
          <Chip pressed={expanded} tone="accent" size="xs" onClick={onToggleInventory}>
            {expanded ? "Close" : "Manage"}
          </Chip>
        </td>
        <td className="px-3 py-3 text-center">
          <DeleteOrOnlineCell
            deleteMode={deleteMode}
            isSelf={isSelf}
            confirmingDelete={confirmingDelete}
            onStartDelete={onStartDelete}
            onlineMode={(user.onlineMode ?? "offline") as OnlineMode}
            email={user.email}
            onSetOnlineMode={onSetOnlineMode}
            pending={pending}
            onResetPassword={onResetPassword}
            resettingPassword={resettingPassword}
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
        isAdmin ? "bg-accent-500/20 text-accent-300" : "bg-white/5 text-fg-secondary"
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
  onlineMode: OnlineMode;
  email: string;
  onSetOnlineMode: (mode: OnlineMode) => void;
  pending: boolean;
  onResetPassword: () => void;
  resettingPassword: boolean;
};

/**
 * Last column of the row. When delete mode is on, shows either the Delete
 * chip, a "Confirm below…" hint while the confirm sub-row is open, or an
 * inert "you" pill for the current admin (can't delete themselves). When
 * delete mode is off, shows the three-state online-mode picker.
 */
function DeleteOrOnlineCell({
  deleteMode,
  isSelf,
  confirmingDelete,
  onStartDelete,
  onlineMode,
  email,
  onSetOnlineMode,
  pending,
  onResetPassword,
  resettingPassword,
}: DeleteOrOnlineProps) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {deleteMode ? (
        isSelf ? (
          <span
            className="inline-flex h-6 items-center rounded-md border border-white/5 bg-white/5 px-2.5 text-xs italic text-fg-muted"
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
        <>
          <IconButton
            variant="subtle"
            size="xs"
            aria-label={`Generate password-reset link for ${email}`}
            title="Generate password-reset link"
            onClick={onResetPassword}
            disabled={resettingPassword}
            icon={<KeyIcon className="h-3.5 w-3.5" />}
          />
          <SegmentedControl<OnlineMode>
            options={ONLINE_MODE_OPTIONS_COMPACT}
            value={onlineMode}
            onChange={onSetOnlineMode}
            shape="pill"
            size="xs"
            selectionMode="toggle"
            tone="accent"
            disabled={pending}
            aria-label={`Online mode for ${email}`}
          />
        </>
      )}
    </div>
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
          className="w-full flex-1 rounded-md border border-rose-500/30 bg-surface-950 px-3 py-1.5 text-sm text-white placeholder:text-fg-disabled focus:border-rose-400 focus:outline-none disabled:opacity-50"
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
