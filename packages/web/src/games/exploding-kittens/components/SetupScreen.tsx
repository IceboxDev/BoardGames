import { explodingKittensManifest } from "@boardgames/core/games/exploding-kittens/manifest";
import { PvAISetupScreen } from "../../../components/setup";

interface SetupScreenProps {
  onStart: (playerCount: number, strategy: string) => void;
}

export default function SetupScreen({ onStart }: SetupScreenProps) {
  return (
    <PvAISetupScreen
      title="Exploding Kittens"
      manifest={explodingKittensManifest}
      onStart={onStart}
    />
  );
}
