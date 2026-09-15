// Hand-over mode: the Storyteller passes the phone to a player who cannot
// point (or whisper), so that player can tap a name themselves — as the Demon
// choosing a victim, the Fortune Teller picking two players, the Gambler
// naming a character. While it is on, every Storyteller-only fact goes dark:
// character icons and labels in the seat grid, the Grimoire and the log, the
// true numbers, the token reveals, and the tinted hints.
//
// The switch is per device and persisted, so a refresh while the phone is in
// a player's hands cannot un-hide the roles.

import { type ReactNode, useCallback, useMemo, useState } from "react";
import { PrivacyContext } from "./privacy-context";

const STORAGE_KEY = "botc-companion-handover";

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function PrivacyProvider({
  children,
  initial,
}: {
  children: ReactNode;
  /** Test seam; defaults to the persisted switch. */
  initial?: boolean;
}) {
  const [handOver, set] = useState(() => initial ?? readStored());
  const setHandOver = useCallback((on: boolean) => {
    set(on);
    try {
      if (on) localStorage.setItem(STORAGE_KEY, "1");
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Best-effort only.
    }
  }, []);
  const value = useMemo(() => ({ handOver, setHandOver }), [handOver, setHandOver]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}
