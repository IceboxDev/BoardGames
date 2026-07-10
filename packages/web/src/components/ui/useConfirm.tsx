import { type ReactNode, useCallback, useRef, useState } from "react";
import { Button } from "./Button";
import { Modal, ModalFooter } from "./Modal";

// ── useConfirm ───────────────────────────────────────────────────────────
//
// The single destructive-confirmation primitive. Replaces the native
// `confirm()` / `window.confirm()` calls that sat in the middle of otherwise
// fully-themed flows (deleting a match, kicking an attendee): an unstyled OS
// dialog that ignores the design system, can't be dismissed by tapping outside
// on mobile, and blocks the main thread.
//
// Usage — the caller renders the returned dialog node and awaits the promise:
//
//   const { confirm, confirmDialog } = useConfirm();
//   …
//   async function handleDelete(m: MatchRecord) {
//     const ok = await confirm({
//       title: `Delete this ${m.gameTitle} match?`,
//       description: "This cannot be undone.",
//       confirmLabel: "Delete match",
//       tone: "danger",
//     });
//     if (ok) deleteMutation.mutate(m.id);
//   }
//   …
//   return (<>{page}{confirmDialog}</>);
//
// Deliberately hook-plus-node rather than a context provider: confirmation is
// always local to the component that owns the destructive action, and a
// provider would put a global dialog in the tree that any child could open.

export type ConfirmOptions = {
  title: ReactNode;
  description?: ReactNode;
  /** Label of the confirming action. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label of the dismissing action. Defaults to "Cancel". */
  cancelLabel?: string;
  /** `danger` paints the confirming button rose. Defaults to `danger`, since
   *  a confirmation almost always guards something destructive. */
  tone?: "danger" | "primary";
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

export function useConfirm(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmDialog: ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  // Held in a ref as well so `settle` never closes over a stale `pending`.
  const pendingRef = useRef<Pending | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const next = { ...options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    pendingRef.current?.resolve(ok);
    pendingRef.current = null;
    setPending(null);
  }, []);

  const confirmDialog = pending ? (
    <Modal
      size="xs"
      onClose={() => settle(false)}
      title={pending.title}
      titleClassName="text-lg font-bold tracking-tight text-white"
    >
      {pending.description && (
        <p className="text-sm leading-relaxed text-fg-secondary">{pending.description}</p>
      )}
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={() => settle(false)}>
          {pending.cancelLabel ?? "Cancel"}
        </Button>
        <Button
          variant={pending.tone === "primary" ? "primary" : "danger"}
          size="sm"
          onClick={() => settle(true)}
        >
          {pending.confirmLabel ?? "Confirm"}
        </Button>
      </ModalFooter>
    </Modal>
  ) : null;

  return { confirm, confirmDialog };
}
