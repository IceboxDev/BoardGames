import { D20Die } from "../../../components/offline/D20Die";
import { HeroBanner } from "./ui";

// The campaign hall's torch-lit hero — same recipe as the D&D-night RSVP
// panel (DndNightPanel), scaled up to a page banner. The d20 always shows a
// natural 20: the roll every campaign begins with, in spirit.

export function HallHero() {
  return (
    <HeroBanner
      size="lg"
      glow="strong"
      shimmer
      media={<D20Die count={20} className="dnd-die dnd-die-animated h-24 w-24 sm:h-28 sm:w-28" />}
      eyebrow="The Dungeon Master's Sanctum"
      title="Campaign Hall"
      subtitleStyle="prose"
      subtitle="Choose the world and storyline you'll run — or add a new adventure module and the sages will chart its waypoints and cast."
    />
  );
}
