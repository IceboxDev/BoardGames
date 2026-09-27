import { sensoManifest } from "@boardgames/core/games/senso-battle-for-japan/manifest";
import { PvAISetupScreen } from "../../../components/setup";

interface SetupScreenProps {
  onStart: (playerCount: number, strategy: string) => void;
}

export default function SetupScreen({ onStart }: SetupScreenProps) {
  return (
    <PvAISetupScreen
      title="Sensō: Battle for Japan"
      manifest={sensoManifest}
      defaultPlayerCount={3}
      onStart={onStart}
    />
  );
}
