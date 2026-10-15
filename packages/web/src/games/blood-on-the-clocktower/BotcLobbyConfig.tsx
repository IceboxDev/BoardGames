import { EDITION_NAME } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import {
  type BotcConfig,
  botcManifest,
} from "@boardgames/core/games/blood-on-the-clocktower/manifest";
import { configOrDefaults } from "@boardgames/core/machines/manifest";
import { CheckRow, FieldGroup, SegmentedControl } from "../../components/ui";
import type { LobbyConfigProps } from "../types";

// The online table's options. Seat 0 is the Storyteller (the lobby's seat
// names say so; swap seats to hand the Grimoire to someone else). The server
// parses this with the manifest's schema on Start.

const VOTE_SPEEDS = [
  { value: 1000, label: "Brisk" },
  { value: 1500, label: "Normal" },
  { value: 2500, label: "Slow" },
] as const;

export default function BotcLobbyConfig({ value, onChange, isHost = true }: LobbyConfigProps) {
  const cfg = configOrDefaults(botcManifest, value);
  const set = (patch: Partial<BotcConfig>) => onChange({ ...cfg, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <FieldGroup label="Script">
        <SegmentedControl
          options={[
            { value: "trouble-brewing", label: EDITION_NAME["trouble-brewing"] },
            { value: "bad-moon-rising", label: EDITION_NAME["bad-moon-rising"] },
          ]}
          value={cfg.edition}
          onChange={(edition) => isHost && set({ edition })}
          shape="rounded"
          size="sm"
        />
      </FieldGroup>
      <FieldGroup label="Demon bluffs">
        <SegmentedControl
          options={[
            { value: "new", label: "New Demon", title: "Safer bluffs" },
            { value: "experienced", label: "Experienced", title: "Bolder bluffs" },
          ]}
          value={cfg.demonSkill}
          onChange={(demonSkill) => isHost && set({ demonSkill })}
          shape="rounded"
          size="sm"
        />
      </FieldGroup>
      <FieldGroup label="Vote clock">
        <SegmentedControl
          options={VOTE_SPEEDS.map((s) => ({ value: s.value, label: s.label }))}
          value={cfg.voteClockMs}
          onChange={(voteClockMs) => isHost && set({ voteClockMs })}
          shape="rounded"
          size="sm"
        />
      </FieldGroup>
      <FieldGroup label="Talking">
        <div className="flex flex-col gap-2">
          <CheckRow
            checked={cfg.whispers}
            disabled={!isHost}
            onChange={() => set({ whispers: !cfg.whispers })}
            title="Private whispers"
            description="Players may whisper each other by day. The Storyteller reads every whisper."
          />
          <CheckRow
            checked={cfg.publicChatAtNight}
            disabled={!isHost}
            onChange={() => set({ publicChatAtNight: !cfg.publicChatAtNight })}
            title="Town chat at night"
            description="Keep the town square open while everyone sleeps."
          />
        </div>
      </FieldGroup>
    </div>
  );
}
