import { D20Die } from "../../../components/offline/D20Die";

// The campaign hall's torch-lit hero — same recipe as the D&D-night RSVP
// panel (DndNightPanel), scaled up to a page banner. The d20 always shows a
// natural 20: the roll every campaign begins with, in spirit.

export function HallHero() {
  return (
    <div className="dnd-hero-glow relative shrink-0 overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-br from-[#3b0a0a] via-[#1a0606] to-black p-6 text-center sm:p-8">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_60%_at_50%_28%,rgba(220,38,38,0.5),transparent_72%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-amber-200/20 to-transparent motion-safe:animate-seal-shimmer"
      />
      <div className="relative flex flex-col items-center gap-4">
        <span aria-hidden="true">
          <D20Die count={20} className="dnd-die dnd-die-animated h-24 w-24 sm:h-28 sm:w-28" />
        </span>
        <div>
          <p className="font-fantasy text-2xs font-bold uppercase tracking-[0.35em] text-amber-300/80">
            The Dungeon Master's Sanctum
          </p>
          <h1
            className="font-fantasy mt-2 text-4xl font-bold text-amber-100 sm:text-5xl"
            style={{ textShadow: "0 2px 14px rgba(0,0,0,0.7)" }}
          >
            Campaign Hall
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-amber-200/75">
            Choose the world and storyline you'll run — or add a new adventure module and the sages
            will chart its waypoints and cast.
          </p>
        </div>
      </div>
    </div>
  );
}
