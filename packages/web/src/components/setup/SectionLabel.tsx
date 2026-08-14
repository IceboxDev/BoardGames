import type { ReactNode } from "react";
import { Eyebrow } from "../ui/Label";

/**
 * Section label above a setup-screen block. A thin semantic wrapper over the
 * shared `Eyebrow` primitive (lg density, neutral tone) — it exists only to
 * fix the heading level and the standard mb-5 rhythm for setup columns.
 * Denser strips that can't afford the margin use `SectionHeading`
 * (ControlGroup.tsx), which is the same Eyebrow at `size="sm"`.
 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Eyebrow as="h3" size="lg" tone="neutral" className="mb-5">
      {children}
    </Eyebrow>
  );
}
