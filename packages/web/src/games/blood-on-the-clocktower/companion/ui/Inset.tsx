import type { ReactNode } from "react";
import { Surface } from "../../../../components/ui";

// A darker inset inside a Panel: the resolve-now box under a seat pick
// (kill buttons, the about-to-die block, a confirmed pick row). Surface's
// `tile` treatment, pulled darker so it reads as a well in the panel.
export function Inset({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Surface
      variant="tile"
      padding="sm"
      className={`border-line bg-surface-950/60 ${className ?? ""}`}
    >
      {children}
    </Surface>
  );
}
