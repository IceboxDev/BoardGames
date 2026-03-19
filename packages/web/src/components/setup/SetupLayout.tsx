import type { ReactNode } from "react";

export function SetupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-6 py-12">
      {children}
    </div>
  );
}
