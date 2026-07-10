import type { ReactNode } from "react";

// ── Field / FieldGroup ───────────────────────────────────────────────────
//
// `Field` labels a single form CONTROL: it needs an `htmlFor` because the label
// points at a real input/select/textarea.
//
// `FieldGroup` labels a COMPOSITE control that has no single focusable element
// to point at — a swatch grid, a chip row, a file dropzone, a list of editable
// link rows. Five sites had hand-copied `Field`'s exact label markup precisely
// because they couldn't supply an `htmlFor`; this is the primitive they wanted.
// It renders a plain `<span>` label (not a `<label>`), since a `<label>` with
// no control is a lie to assistive tech — pass `aria-label` on the composite
// itself when it needs a name.
//
// Both share one label style, so a "Tagline" input and an "Accent color" swatch
// grid sit on the same typographic baseline.

const LABEL_CLS = "text-xs font-medium uppercase tracking-label text-fg-secondary";

type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className={LABEL_CLS}>
        {label}
      </label>
      {children}
      {error ? (
        <span className="text-xs text-rose-400">{error}</span>
      ) : hint ? (
        <span className="text-xs text-fg-muted">{hint}</span>
      ) : null}
    </div>
  );
}

type FieldGroupProps = {
  label: string;
  /** Optional trailing control on the label row (e.g. an "Add" button). */
  action?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
};

export function FieldGroup({ label, action, hint, children }: FieldGroupProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {action ? (
        <div className="flex items-center justify-between">
          <span className={LABEL_CLS}>{label}</span>
          {action}
        </div>
      ) : (
        <span className={LABEL_CLS}>{label}</span>
      )}
      {children}
      {hint && <span className="text-xs text-fg-muted">{hint}</span>}
    </div>
  );
}
