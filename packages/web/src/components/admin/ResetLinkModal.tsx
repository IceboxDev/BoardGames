import { Button } from "../ui/Button";
import { CopyField } from "../ui/CopyField";
import { Modal } from "../ui/Modal";
import type { AdminUser } from "./types";

type Props = {
  user: AdminUser;
  url: string;
  expiresInMinutes: number;
  onClose: () => void;
};

/**
 * Shows the one-time reset link the admin just minted. No email is sent — the
 * admin copies the URL and relays it via the group's own channel. The field is
 * selectable as a fallback when the clipboard API is blocked.
 */
export function ResetLinkModal({ user, url, expiresInMinutes, onClose }: Props) {
  return (
    <Modal onClose={onClose} size="sm" eyebrow="Password reset" title="One-time reset link">
      <div className="space-y-4">
        <p className="text-sm text-fg-secondary">
          Send this link to{" "}
          <span className="font-medium text-fg-primary">{user.name || user.email}</span>. It works
          once and expires in {expiresInMinutes} minutes.
        </p>
        <CopyField value={url} ariaLabel="Password reset link" mono />
        <p className="text-xs text-fg-muted">
          No email is sent — share it however you normally reach them. They open it to set a new
          password.
        </p>
        <div className="flex justify-end">
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
