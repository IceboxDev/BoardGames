import { useCallback, useState } from "react";
import { mutePreference } from "./synth";

/** A game's remembered mute toggle: `[muted, toggle]`. */
export function useMuted(key: string): readonly [boolean, () => void] {
  const [muted, setMuted] = useState(() => mutePreference(key).read());
  const toggle = useCallback(() => {
    setMuted((m) => {
      mutePreference(key).write(!m);
      return !m;
    });
  }, [key]);
  return [muted, toggle] as const;
}
