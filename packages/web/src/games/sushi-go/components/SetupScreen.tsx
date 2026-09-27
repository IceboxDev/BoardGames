import { sushiGoManifest } from "@boardgames/core/games/sushi-go/manifest";
import { PvAISetupScreen } from "../../../components/setup";

interface SetupScreenProps {
  onStart: (playerCount: number, strategy: string) => void;
}

/** Nash and Minimax solve the two-player game only; the manifest offers Random at bigger tables. */
export default function SetupScreen({ onStart }: SetupScreenProps) {
  return <PvAISetupScreen title="Sushi Go!" manifest={sushiGoManifest} onStart={onStart} />;
}
