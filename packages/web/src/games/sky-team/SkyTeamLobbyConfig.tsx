import { useMemo } from "react";
import type { LobbyConfigProps } from "../types";
import ScenarioPicker from "./components/ScenarioPicker";
import { SCENARIO_CARDS } from "./scenarios";

/**
 * Resolve the current MP config (`{ scenarioId: "..." }`) to a scenario
 * card slug for the picker. The route seeds config from
 * `def.defaultMpConfig`, so on first render this matches whatever
 * `yul-green` (the only wired-up card today) points at; subsequent
 * picker changes flow back through `onChange`.
 */
function readSlug(value: unknown): string {
  if (value && typeof value === "object" && "scenarioId" in value) {
    const id = (value as { scenarioId?: unknown }).scenarioId;
    if (typeof id === "string") {
      const match = SCENARIO_CARDS.find((c) => c.backendId === id);
      if (match) return match.slug;
    }
  }
  // Fall back to the first card with a wired backend id.
  return SCENARIO_CARDS.find((c) => c.backendId != null)?.slug ?? "yul-green";
}

/**
 * Sky Team's multiplayer scenario picker. Rendered inside `<Lobby>` as
 * the game-specific config slot — the host's selection is the
 * `{ scenarioId }` payload sent to the server when Start fires.
 *
 * Only the host sees the picker; non-hosts see a passive placeholder.
 * `value` and `onChange` are owned per-seat by the lobby route, so
 * letting non-hosts click would just edit their local-only state and
 * mislead them.
 */
export default function SkyTeamLobbyConfig({ value, onChange, isHost }: LobbyConfigProps) {
  const slug = readSlug(value);

  const summary = useMemo(() => SCENARIO_CARDS.find((c) => c.slug === slug), [slug]);

  if (!isHost) {
    return (
      <div className="mx-auto mb-4 w-full max-w-md rounded-xl border border-white/10 bg-surface-800/30 px-4 py-3 text-center">
        <div className="mb-1 text-3xs font-bold uppercase tracking-[0.25em] text-fg-secondary">
          Destination
        </div>
        <div className="font-mono text-base font-black tracking-wider text-white">
          {summary?.airportCode ?? "—"}
        </div>
        <div className="text-xs text-fg-secondary">
          {summary?.airportName ?? "Awaiting host's selection"}
        </div>
        <div className="mt-1 text-3xs text-fg-muted">The host is choosing the airport.</div>
      </div>
    );
  }

  const handleSelect = (newSlug: string) => {
    const card = SCENARIO_CARDS.find((c) => c.slug === newSlug);
    if (!card?.backendId) return;
    onChange({ scenarioId: card.backendId });
  };

  return (
    <div className="mx-auto mb-4 w-full max-w-3xl">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-secondary">
        Destination
      </div>
      {/* `h-[24rem]` gives the picker enough vertical space for its
          flex-1 cards to render at usable height inside the lobby's
          scrolling container. */}
      <div className="h-[24rem]">
        <ScenarioPicker selectedSlug={slug} onSelect={handleSelect} />
      </div>
    </div>
  );
}
