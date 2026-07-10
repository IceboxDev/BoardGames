import type { ReactNode } from "react";

// ── Section ──────────────────────────────────────────────────────────────
//
// A titled content section: an uppercase tracking heading (optional leading
// icon + trailing count) above its body, with a consistent gap. Promoted from
// the local helper in PlayerProfilePage so other pages stop re-rolling the same
// `<section><h2 className="… uppercase tracking-…">…</h2></section>` block.
//
// This owns the *labelled* section pattern; for an unlabelled column with a
// chosen rhythm use `Stack`.

type SectionProps = {
  title: string;
  icon?: ReactNode;
  /** Optional trailing count rendered as "(n)" after the title. */
  count?: number;
  children: ReactNode;
};

export function Section({ title, icon, count, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-label text-fg-secondary">
        {icon}
        {title}
        {count !== undefined && <span className="font-medium text-fg-muted">({count})</span>}
      </h2>
      {children}
    </section>
  );
}
