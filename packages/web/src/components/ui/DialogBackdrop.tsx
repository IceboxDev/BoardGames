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
      // -bottom-24: a `fixed inset-0` overlay tracks the LAYOUT viewport, but
      // when a mobile browser's toolbar collapses the visual viewport grows
      // past it, exposing a strip of undimmed page at the very bottom edge.
      // Bleeding the scrim below the overlay covers that strip on every modal.
      className={`absolute inset-x-0 top-0 -bottom-24 cursor-default bg-surface-950/90 backdrop-blur-sm${
        onDismiss ? "" : " pointer-events-none"
      }`}
    />
  );
}
