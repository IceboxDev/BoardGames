import { EDITION_NAME } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import {
  type BotcConfig,
  botcManifest,
} from "@boardgames/core/games/blood-on-the-clocktower/manifest";
import { configOrDefaults } from "@boardgames/core/machines/manifest";
import type { SetupOption } from "../../components/setup";
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

/** The table's options as fields: the solo bots setup lays them out across its panel. */
export function botcOptionFields(
  cfg: BotcConfig,
  set: (patch: Partial<BotcConfig>) => void,
  isHost = true,
): SetupOption[] {
  return [
    {
      id: "edition",
      label: "Script",
      span: "l",
      control: (
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
      ),
    },
    {
      id: "demon",
      label: "Demon bluffs",
      span: "s",
      control: (
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
      ),
    },
    {
      id: "vote",
      label: "Vote clock",
      span: "s",
      control: (
        <SegmentedControl
          options={VOTE_SPEEDS.map((s) => ({ value: s.value, label: s.label }))}
          value={cfg.voteClockMs}
          onChange={(voteClockMs) => isHost && set({ voteClockMs })}
          shape="rounded"
          size="sm"
        />
      ),
    },
    {
      id: "talking",
      label: "Talking",
      span: "l",
      control: (
        <div className="grid w-full gap-2 sm:grid-cols-2">
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
      ),
    },
  ];
}

export default function BotcLobbyConfig({ value, onChange, isHost = true }: LobbyConfigProps) {
  const cfg = configOrDefaults(botcManifest, value);
  const set = (patch: Partial<BotcConfig>) => onChange({ ...cfg, ...patch });
  return (
    <div className="flex flex-col gap-4">
      {botcOptionFields(cfg, set, isHost).map((field) => (
        <FieldGroup key={field.id} label={String(field.label)}>
          {field.control}
        </FieldGroup>
      ))}
    </div>
  );
}
