import type { ReactNode } from "react";

interface GameScreenProps {
  /** Background class applied to the root container (e.g. "bg-black"). */
  background?: string;
  /** Extra classes on the content area (e.g. "mx-auto max-w-2xl"). Gap and padding are built-in. */
  contentClassName?: string;
  /** History log content. GameScreen provides the sidebar chrome. */
  sidebar?: ReactNode;
  /** Card hand component (CardFan, PlayerHand, etc.). Pinned to bottom of content area. */
  fan?: ReactNode;
  /** Controls above the card fan (Confirm button, Pass/Take, status, etc.). */
  fanActions?: ReactNode;
  /** Main game board content. */
  children: ReactNode;
  /** Skip content-area padding and flex-col (for edge-to-edge canvas games). */
  noPadding?: boolean;
}

export default function GameScreen({
  background,
  contentClassName,
  sidebar,
  fan,
  fanActions,
  children,
  noPadding,
}: GameScreenProps) {
  return (
    <div className={`flex min-h-0 flex-1${background ? ` ${background}` : ""}`}>
      {noPadding ? (
        <div className="min-h-0 min-w-0 flex-1">{children}</div>
      ) : (
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col gap-2 px-2 pt-2 sm:px-4 sm:pt-4${contentClassName ? ` ${contentClassName}` : ""}`}
        >
          {fan != null ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-2 border-2 border-green-400 bg-green-400/10">
                {children}
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <div className="flex h-9 items-center justify-center border-2 border-yellow-400 bg-yellow-400/10">
                  {fanActions}
                </div>
                <div className="border-2 border-pink-400 bg-pink-400/10">{fan}</div>
              </div>
            </>
          ) : (
            children
          )}
        </div>
      )}
      {sidebar && (
        <aside className="my-2 mr-2 hidden w-72 shrink-0 flex-col overflow-y-auto rounded-xl bg-gray-900/60 p-4 lg:flex border-2 border-cyan-400 bg-cyan-400/10">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">History</h3>
          {sidebar}
        </aside>
      )}
    </div>
  );
}
