import type { ReactNode } from "react";

// The single inline error banner. One rose tone, one geometry. It is the ONLY
// sanctioned way to surface an error string in app chrome: a hand-rolled rose
// box (`rounded-md border border-rose-500/30 …`) or a loose
// `<p className="text-xs text-rose-400">` re-implements this with drifted
// geometry, and the `raw-error-text` style-guard rule now rejects both.
// `role="alert"` so the message is announced when it appears.
//
// Inside a dialog, pass it as `ModalFooter`'s `start` slot so the error sits on
// the action row rather than pushing the body around.

type ErrorAlertProps = {
  /** Optional bold lead line above the message. */
  title?: string;
  message: ReactNode;
  className?: string;
};

export function ErrorAlert({ title, message, className = "" }: ErrorAlertProps) {
  return (
    <div
      role="alert"
      className={`rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300 ${className}`}
    >
      {title && <p className="font-semibold text-rose-200">{title}</p>}
      <p className={title ? "mt-0.5 text-rose-300/90" : ""}>{message}</p>
    </div>
  );
}
