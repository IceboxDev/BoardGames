import { useState } from "react";
import { Button } from "../ui/Button";
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
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the input stays selectable for a manual copy.
    }
  }

  return (
    <Modal onClose={onClose} size="sm" eyebrow="Password reset" title="One-time reset link">
      <div className="space-y-4">
        <p className="text-sm text-fg-secondary">
          Send this link to{" "}
          <span className="font-medium text-fg-primary">{user.name || user.email}</span>. It works
          once and expires in {expiresInMinutes} minutes.
        </p>
        <div className="flex items-stretch gap-2">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Password reset link"
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-surface-950 px-3 py-2 font-mono text-xs text-fg-primary focus:border-accent-400 focus:outline-none"
          />
          <Button variant="secondary" size="sm" onClick={copy} className="shrink-0">
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
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
