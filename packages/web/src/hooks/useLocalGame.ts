import { useMachine } from "@xstate/react";
import type { AnyStateMachine, EventFrom, StateFrom } from "xstate";

// NOTE: This runs an XState machine CLIENT-SIDE and is NOT how the 8 games run.
// All games are server-authoritative (see `useGameShell` / `useRemoteGame`).
// This hook exists ONLY for Set's standalone trainer mini-mode
// (`games/set/components/TrainerGame.tsx`). Don't reach for it for a game session.

export interface LocalGameState<TMachine extends AnyStateMachine> {
  snapshot: StateFrom<TMachine>;
  send: (event: EventFrom<TMachine>) => void;
}

export function useLocalGame<TMachine extends AnyStateMachine>(
  machine: TMachine,
): LocalGameState<TMachine> {
  // biome-ignore lint/suspicious/noExplicitAny: xstate generic inference requires cast
  const [snapshot, send] = useMachine(machine as any);

  return {
    snapshot: snapshot as StateFrom<TMachine>,
    send: send as (event: EventFrom<TMachine>) => void,
  };
}
