import { type ReactNode, useCallback, useMemo, useRef } from "react";
import { GameBackOverrideContext } from "./game-back-override-context";

export function GameBackOverrideProvider({ children }: { children: ReactNode }) {
  const overrideRef = useRef<(() => void) | null>(null);

  const setBackOverride = useCallback((fn: (() => void) | null) => {
    overrideRef.current = fn;
  }, []);

  const value = useMemo(() => ({ overrideRef, setBackOverride }), [setBackOverride]);

  return (
    <GameBackOverrideContext.Provider value={value}>{children}</GameBackOverrideContext.Provider>
  );
}
