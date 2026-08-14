import type { ReactNode } from "react";
import { Eyebrow } from "../ui/Label";
import { Surface } from "../ui/Surface";

/**
 * Micro section heading used by the full-viewport setup/lobby screens
 * (Sky Team's SetupScreen and the wide Lobby layout). The shared `Eyebrow`
 * at its `sm` density, margin-free — these screens stack several labelled
 * strips and can't afford `SectionLabel`'s mb-5.
 */
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <Eyebrow as="h2" size="sm" inheritColor className="shrink-0 text-fg-secondary">
      {children}
    </Eyebrow>
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
      <Surface variant="raised" padding="md" className="min-h-[6.5rem] flex-1">
        {children}
      </Surface>
    </section>
  );
}
