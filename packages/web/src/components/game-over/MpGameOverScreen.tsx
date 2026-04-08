import type { ReactNode } from "react";
import { GameOverLayout } from "./GameOverLayout";

interface MpGameOverScreenProps {
  headline: string;
  headlineColor?: "win" | "lose" | "draw";
  subtitle?: string;
  onBackToMenu: () => void;
  children?: ReactNode;
}

export function MpGameOverScreen({
  headline,
  headlineColor = "neutral" as "win" | "lose" | "draw",
  subtitle,
  onBackToMenu,
  children,
}: MpGameOverScreenProps) {
  return (
    <GameOverLayout
      headline={headline}
      headlineColor={headlineColor}
      subtitle={subtitle}
      actions={[{ label: "Back to Menu", variant: "primary", onClick: onBackToMenu }]}
    >
      {children}
    </GameOverLayout>
  );
}
