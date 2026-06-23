import { SectionHeading } from "../../components/setup";
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
 * Sky Team's multiplayer scenario picker. Rendered inside the wide
 * `<Lobby>` layout's flex-1 config section (`def.lobbyLayout: "wide"`),
 * so it fills the leftover viewport height exactly like the solo
 * SetupScreen's destination gallery — same heading, same full-width
 * four-column grid.
 *
 * Only the host gets the interactive picker; the host's selection is the
 * `{ scenarioId }` payload sent to the server when Start fires. `value`
 * and `onChange` are owned per-seat by the lobby route and never sync
 * across seats, so non-hosts see a passive placeholder instead — showing
 * them a local-only gallery (or our local default's airport code) would
 * just mislead them about what the host actually picked.
 */
export default function SkyTeamLobbyConfig({ value, onChange, isHost }: LobbyConfigProps) {
  const slug = readSlug(value);

  if (!isHost) {
    return (
      <>
        <SectionHeading>Destination</SectionHeading>
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-white/10 bg-surface-900/40">
          <div className="px-6 text-center">
            <div className="text-sm font-semibold text-white">
              The host is choosing the destination
            </div>
            <p className="mt-1 text-xs text-fg-secondary">
              You'll see the airport on the approach track once the flight starts.
            </p>
          </div>
        </div>
      </>
    );
  }

  const handleSelect = (newSlug: string) => {
    const card = SCENARIO_CARDS.find((c) => c.slug === newSlug);
    if (!card?.backendId) return;
    onChange({ scenarioId: card.backendId });
  };

  return (
    <>
      <SectionHeading>Destination</SectionHeading>
      <div className="min-h-0 flex-1">
        <ScenarioPicker selectedSlug={slug} onSelect={handleSelect} />
      </div>
    </>
  );
}
