import { createContext, type MutableRefObject } from "react";

export type GameBackOverrideContextValue = {
  overrideRef: MutableRefObject<(() => void) | null>;
  setBackOverride: (fn: (() => void) | null) => void;
};

export const GameBackOverrideContext = createContext<GameBackOverrideContextValue | null>(null);
