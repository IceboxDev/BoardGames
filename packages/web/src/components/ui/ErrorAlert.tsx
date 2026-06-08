import type { ReactNode } from "react";

// The single inline error banner. One rose tone, one geometry — replaces the
// fork between Tailwind `red-*` and `rose-*` error boxes and the loose
// `text-xs text-rose-400` one-liners scattered through forms and modals.
// `role="alert"` so the message is announced when it appears.

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
