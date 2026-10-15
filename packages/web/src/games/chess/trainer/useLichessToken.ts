import { useCallback, useState } from "react";
import { lichessToken } from "./lichess/oauth";

/** The lichess token in this browser, and a way to re-read it after it changes. */
export function useLichessToken(): [string | null, () => void] {
  const [token, setToken] = useState(() => lichessToken());
  const refresh = useCallback(() => setToken(lichessToken()), []);
  return [token, refresh];
}
