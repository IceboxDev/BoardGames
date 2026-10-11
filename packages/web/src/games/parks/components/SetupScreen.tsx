import { parksManifest } from "@boardgames/core/games/parks/manifest";
import { PvAISetupScreen } from "../../../components/setup";

interface SetupScreenProps {
  onStart: (strategy: string) => void;
}

/** Parks is two-player only, so the setup is just the AI pick. */
export default function SetupScreen({ onStart }: SetupScreenProps) {
  return (
    <PvAISetupScreen
      title="Parks"
      manifest={parksManifest}
      onStart={(_playerCount, strategy) => onStart(strategy)}
    />
  );
}
