// The single dialog-backdrop element, shared by Modal and Overlay (and any
// future portaled layer). Owns the scrim color, blur, and the
// dismiss-on-click wiring. Rendered as a <button> so the backdrop is a real
// focusable-skipped (tabIndex={-1}) click target for assistive tech rather
// than a div with an onClick.
//
// When `onDismiss` is omitted the backdrop becomes inert
// (`pointer-events-none`) so clicks fall through to nothing instead of
// silently eating them — the caller has declared "clicking outside does not
// close this dialog".

type DialogBackdropProps = {
  /** Click-to-dismiss handler. Omit to render an inert (non-dismissing) scrim. */
  onDismiss?: () => void;
  /** Accessible name for the backdrop button. */
  label?: string;
};

export function DialogBackdrop({ onDismiss, label = "Close" }: DialogBackdropProps) {
  return (
    <button
      type="button"
      aria-label={label}
      tabIndex={-1}
      onClick={onDismiss}
      className={`absolute inset-0 cursor-default bg-surface-950/85 backdrop-blur-sm${
        onDismiss ? "" : " pointer-events-none"
      }`}
    />
  );
}
