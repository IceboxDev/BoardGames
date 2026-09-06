import type { ReactNode } from "react";
import { RADIUS_CARD_2XL } from "./radii";

// ── AuthCard ───────────────────────────────────────────────────────────────
//
// The centered auth panel shared by the sign-in and reset-password pages.
// Owns the card chrome (rounded-2xl bordered panel with the auth-specific
// shadow + backdrop blur) and the gradient title/subtitle block, so the two
// auth screens stop hand-duplicating an identical container and an identical
// `<h1 className="gradient-text …">`. Drop it inside a
// `<PageShell layout="centered">` — the shell owns the vertical + horizontal
// centering; AuthCard owns the card and its heading.
//
// The gradient wordmark title is auth-specific, so this stays its own heading
// primitive rather than routing through PageHeader (whose title is always the
// flat `text-fg-strong` emphasis tier). AuthCard is therefore allowlisted in the
// style guard's raw-heading-size / raw-card-chrome rules, alongside the other
// chrome-owning primitives (Surface, Modal, …).

type AuthCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
};

export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <div
      className={`w-full max-w-md space-y-6 ${RADIUS_CARD_2XL} border border-line bg-surface-900/80 p-8 shadow-2xl backdrop-blur`}
    >
      <div className="text-center">
        <h1 className="gradient-text text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-fg-secondary">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
