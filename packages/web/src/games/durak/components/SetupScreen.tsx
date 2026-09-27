import { durakManifest } from "@boardgames/core/games/durak/manifest";
import { PvAISetupScreen } from "../../../components/setup";

interface SetupScreenProps {
  onStart: (playerCount: number, strategy: string) => void;
}

export default function SetupScreen({ onStart }: SetupScreenProps) {
  return <PvAISetupScreen title="Durak" manifest={durakManifest} onStart={onStart} />;
}
