import { decryptoManifest } from "@boardgames/core/games/decrypto/manifest";
import { configOrDefaults } from "@boardgames/core/machines/manifest";
import { Checkbox } from "../../components/ui";
import type { LobbyConfigProps } from "../types";

// Decrypto's lobby options. The VARIANT is not chosen here — it follows the
// seat fill (four seats = 2v2 standard; three = the official 3-player
// Interceptor variant, the third seat intercepting alone).

export default function DecryptoLobbyConfig({ value, onChange, isHost }: LobbyConfigProps) {
  const config = configOrDefaults(decryptoManifest, value);

  return (
    <div className="mx-auto mb-6 flex w-full max-w-md flex-col gap-2">
      <Checkbox
        label="30-second clue timer (once one encryptor finishes, the other has 30s)"
        checked={config.timerEnabled}
        disabled={!isHost}
        onChange={(e) => onChange({ ...config, timerEnabled: e.target.checked })}
      />
      <p className="text-3xs leading-snug text-fg-muted">
        Fill all four seats for the standard 2v2 game, or three to play the Interceptor variant (the
        third seat intercepts alone).
      </p>
    </div>
  );
}
