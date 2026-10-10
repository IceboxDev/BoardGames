import type { Action } from "@boardgames/core/games/connect-4/types";
import { useCallback, useEffect, useState } from "react";

/** How long a sent move holds the board if the server never answers it (a refusal). */
const RELEASE_MS = 3_000;

/**
 * Drop / pop the viewer's legal moves — once per position. A move is in
 * flight until the server's next position arrives (`position` changes), and
 * the board ignores clicks and keys meanwhile: `legal` still lists the old
 * moves until then, so a double click used to send two drops (the second
 * refused, and the refusal cleared the AI's "thinking" mark).
 */
export function useMoveSender(
  legal: readonly Action[],
  send: (action: Action) => void,
  /** Identifies the position on the board (game and move count). */
  position: string,
) {
  const [sentAt, setSentAt] = useState<string | null>(null);
  const pending = sentAt === position;

  useEffect(() => {
    if (!pending) return;
    const release = setTimeout(() => setSentAt(null), RELEASE_MS);
    return () => clearTimeout(release);
  }, [pending]);

  const play = useCallback(
    (type: "drop" | "pop", column: number) => {
      if (pending) return;
      const action = legal.find((a) => a.type === type && a.column === column);
      if (!action) return;
      setSentAt(position);
      send(action);
    },
    [legal, send, position, pending],
  );

  return {
    pending,
    drop: useCallback((column: number) => play("drop", column), [play]),
    pop: useCallback((column: number) => play("pop", column), [play]),
  };
}
