import type { ReactNode } from "react";

interface HistorySidebarProps {
  /** Game content — rendered inside the content wrapper. */
  children: ReactNode;
  /** The action-log component rendered inside the sidebar. */
  sidebar: ReactNode;
  /** Extra classes on the outer flex container (e.g. "bg-black"). */
  className?: string;
  /** Extra classes on the content area (e.g. "gap-2 mx-auto max-w-2xl"). */
  contentClassName?: string;
  /** Skip content-area padding and flex-col (for edge-to-edge content like a canvas). */
  noPadding?: boolean;
}

export default function HistorySidebar({
  children,
  sidebar,
  className,
  contentClassName,
  noPadding,
}: HistorySidebarProps) {
  const contentCls = noPadding
    ? "min-h-0 min-w-0 flex-1"
    : `flex min-h-0 min-w-0 flex-1 flex-col px-2 pt-2 sm:px-4 sm:pt-4${contentClassName ? ` ${contentClassName}` : ""}`;

  return (
    <div className={`flex min-h-0 flex-1${className ? ` ${className}` : ""}`}>
      <div className={contentCls}>{children}</div>
      <aside className="hidden w-72 shrink-0 overflow-y-auto flex-col rounded-xl bg-gray-900/60 p-4 my-2 mr-2 lg:flex">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">History</h3>
        {sidebar}
      </aside>
    </div>
  );
}
