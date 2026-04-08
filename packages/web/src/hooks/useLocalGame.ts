import { useMachine } from "@xstate/react";
import type { AnyStateMachine, EventFrom, StateFrom } from "xstate";

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
