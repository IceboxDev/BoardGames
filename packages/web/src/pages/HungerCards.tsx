import { CARD_DEFS } from "@boardgames/core/games/the-hunger/content/cards";
import HungerCard from "../games/the-hunger/components/HungerCard";
import { missingArt } from "../games/the-hunger/logic/art";

// Dev-only: every The Hunger card three ways — compact at Hunt-Track size,
// compact at board size, and the big showcase face. /dev/hunger-cards
// Narrow it with ?type=human|familiar|power|item|starting, or ?card=<id>.
export default function HungerCards() {
  const q = new URLSearchParams(window.location.search);
  const type = q.get("type");
  const only = q.get("card");
  const defs = [...CARD_DEFS.values()].filter(
    (d) => (!type || d.type === type) && (!only || d.id === only),
  );
  const missing = missingArt();
  return (
    <main className="flex flex-col gap-8 bg-surface-950 p-6">
      <p className="text-sm text-fg-muted">
        {defs.length} cards ·{" "}
        {missing.length === 0 ? "all art present" : `missing: ${missing.join(", ")}`}
      </p>
      {defs.map((d) => (
        <section key={d.id} className="flex items-end gap-6">
          <div className="h-40">
            <HungerCard card={d.id} size="fill-height" />
          </div>
          <div className="w-44">
            <HungerCard card={d.id} />
          </div>
          <div className="w-96">
            <HungerCard card={d.id} variant="showcase" />
          </div>
        </section>
      ))}
    </main>
  );
}
