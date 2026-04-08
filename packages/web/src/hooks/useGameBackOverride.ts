import { useContext } from "react";
import { GameBackOverrideContext } from "../contexts/game-back-override-context";

export function useGameBackOverride() {
  const ctx = useContext(GameBackOverrideContext);
  if (!ctx) {
    throw new Error("useGameBackOverride must be used within GameBackOverrideProvider");
  }
  return ctx;
}
