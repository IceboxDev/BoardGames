import type { CardSize } from "../card-utils";
import { SIZE_CLASSES } from "../card-utils";
import type { StationTheme } from "./StationShell";

const GHOST_BORDER: Record<StationTheme, string> = {
  maki: "border-red-500/20",
  nigiri: "border-rose-500/20",
  tempura: "border-amber-500/20",
  sashimi: "border-emerald-500/20",
  dumpling: "border-yellow-500/20",
  pudding: "border-pink-500/20",
  chopsticks: "border-gray-500/20",
};

const GHOST_TEXT: Record<StationTheme, string> = {
  maki: "text-red-500/30",
  nigiri: "text-rose-500/30",
  tempura: "text-amber-500/30",
  sashimi: "text-emerald-500/30",
  dumpling: "text-yellow-500/30",
  pudding: "text-pink-500/30",
  chopsticks: "text-gray-500/30",
};

interface GhostCardProps {
  theme: StationTheme;
  size?: CardSize;
  label?: string;
}

export default function GhostCard({ theme, size = "tableau", label = "?" }: GhostCardProps) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} animate-breathe flex items-center justify-center rounded-lg border-2 border-dashed ${GHOST_BORDER[theme]}`}
    >
      <span className={`${GHOST_TEXT[theme]} text-xs font-medium`}>{label}</span>
    </div>
  );
}
