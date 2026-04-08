import type { ReactNode } from "react";

export function SetupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-10 flex min-h-full w-full flex-col items-center justify-start overflow-y-auto px-6 py-10 pb-14 sm:py-12 sm:pb-16">
      {children}
    </div>
  );
}
