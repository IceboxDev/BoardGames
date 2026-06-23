import type { ReactNode } from "react";

/**
 * Micro section heading used by the full-viewport setup/lobby screens
 * (Sky Team's SetupScreen and the wide Lobby layout). Tighter and
 * smaller than `SectionLabel` — these screens stack several labelled
 * strips and can't afford its mb-5.
 */
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="shrink-0 text-3xs font-bold uppercase tracking-[0.25em] text-fg-secondary">
      {children}
    </h2>
  );
}

/**
 * One labelled block in a setup/lobby controls strip. Owns the heading
 * + the rounded card frame so all groups in the strip look like siblings
 * and line up vertically regardless of inner content.
 */
export function ControlGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading>{label}</SectionHeading>
      <div className="min-h-[6.5rem] flex-1 rounded-2xl border border-white/10 bg-surface-900/40 p-2.5">
        {children}
      </div>
    </section>
  );
}
