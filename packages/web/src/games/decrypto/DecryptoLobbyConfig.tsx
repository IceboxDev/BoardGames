import { useEffect } from "react";
import { Checkbox } from "../../components/ui";
import type { LobbyConfigProps } from "../types";

// Decrypto's lobby options. The VARIANT is not chosen here — it follows the
// seat fill (all 4 seats = 2v2 standard; only the first 3 = the official
// 3-player Interceptor variant with the "Black 1" seat as the solo
// interceptor), which the room start validates server-side.

type DecryptoMpConfig = { timerEnabled?: boolean };

export default function DecryptoLobbyConfig({ value, onChange, isHost }: LobbyConfigProps) {
  const config = (value ?? {}) as DecryptoMpConfig;

  // Seed a defined-shape config even if the host never touches the toggle.
  useEffect(() => {
    if (value == null) onChange({ timerEnabled: false });
  }, [value, onChange]);

  return (
    <div className="mx-auto mb-6 flex w-full max-w-md flex-col gap-2">
      <Checkbox
        label="30-second clue timer (once one encryptor finishes, the other has 30s)"
        checked={config.timerEnabled === true}
        disabled={!isHost}
        onChange={(e) => onChange({ ...config, timerEnabled: e.target.checked })}
      />
      <p className="text-3xs leading-snug text-fg-muted">
        Fill all four seats for the standard 2v2 game, or just the first three to play the
        Interceptor variant (Black 1 becomes the solo interceptor).
      </p>
    </div>
  );
}
