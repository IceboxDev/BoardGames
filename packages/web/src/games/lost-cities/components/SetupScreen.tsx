import { lostCitiesManifest } from "@boardgames/core/games/lost-cities/manifest";
import { PvAISetupScreen } from "../../../components/setup";

interface SetupScreenProps {
  onSelect: (strategy: string) => void;
}

export default function SetupScreen({ onSelect }: SetupScreenProps) {
  return (
    <PvAISetupScreen
      title="Lost Cities"
      manifest={lostCitiesManifest}
      onStart={(_playerCount, strategy) => onSelect(strategy)}
    />
  );
}
