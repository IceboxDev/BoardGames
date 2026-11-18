import type { ReactNode } from "react";
import { type PendingAction, UndoableActionButton } from "../../../components/game-layout";
import { ErrorAlert } from "../../../components/ui";

// The board's stage under the header and strip: the word grid sized to the
// space left, a move's error floating over its top edge and the presence
// notices over its foot — overlays, so the board never moves for them.

export function BoardStage({
  error,
  notices,
  children,
}: {
  error: string | null;
  /** `PresenceNotices`, pinned to the foot. */
  notices?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {error && (
        <div className="absolute inset-x-0 top-2 z-raised mx-auto w-full max-w-md px-2">
          <ErrorAlert message={error} />
        </div>
      )}
      {children}
      {notices}
    </div>
  );
}

/** Ending the turn: one control, the same in every game (armed, then undoable for a beat). */
export function EndTurnButton({ action }: { action: PendingAction }) {
  return <UndoableActionButton action={action} label="End turn" variant="secondary" />;
}
