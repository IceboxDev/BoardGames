import type { ReactNode } from "react";

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 mb-5">
      {children}
    </h3>
  );
}
