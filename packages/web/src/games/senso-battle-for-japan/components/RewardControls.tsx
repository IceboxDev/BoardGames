import type {
  Action,
  RewardKind,
  RewardSlot,
} from "@boardgames/core/games/senso-battle-for-japan/types";
import {
  CLAN_KANJI,
  CLAN_LABELS,
  REWARD_LABELS,
  REWARD_THRESHOLDS,
} from "@boardgames/core/games/senso-battle-for-japan/types";
import { Badge, Button, Chip } from "../../../components/ui";
import { CLAN_FILL } from "../colors";
import { emperorClans, kindAvailable, passAction } from "../logic/legal";
import {
  isEmperorPicker,
  type PickerEvent,
  type PickerState,
  pickerAs,
} from "../logic/reward-picker";

interface Props {
  legal: Action[];
  picker: PickerState;
  dispatch: (event: PickerEvent) => void;
  slot: RewardSlot | null;
  onPass: () => void;
  /** Contextual explanation of what the map is NOT offering (locked neighbours). */
}

const KINDS: RewardKind[] = ["balance", "determination", "aggression"];

/** The reward the picker is working on, or null at the kind step. */
function armedKindOf(picker: PickerState): RewardKind | null {
  switch (picker.step) {
    case "balance-source":
    case "balance-dest":
      return "balance";
    case "clan":
      return picker.kind;
    case "target":
      return picker.kind === "bonus" ? null : picker.kind;
    default:
      return null;
  }
}

/**
 * The acting player's reward chooser — ONE row in the fan-actions bar, never
 * a caption: the map's highlights say what to click. At the Emperor's clan
 * step the three kind chips give way to the armed kind plus the clan chips,
 * so the row never wraps.
 */
export default function RewardControls({ legal, picker, dispatch, slot, onPass }: Props) {
  const as = pickerAs(picker);
  const pass = passAction(legal);
  const emperor = isEmperorPicker(picker);
  const isBonus = picker.step === "target" && picker.kind === "bonus";
  const armedKind = armedKindOf(picker);
  const choosingClan = picker.step === "clan";

  return (
    <div className="flex flex-nowrap items-center justify-center gap-2">
      {emperor && (
        <Badge tone="amber" size="xs">
          Emperor
        </Badge>
      )}
      {!isBonus &&
        !choosingClan &&
        KINDS.map((kind) => {
          const available = kindAvailable(legal, kind);
          return (
            <Chip
              key={kind}
              pressed={armedKind === kind}
              tone="amber"
              size="sm"
              disabled={!available}
              title={
                available
                  ? undefined
                  : slot?.used.includes(kind)
                    ? "Already taken this round"
                    : `Needs ${REWARD_THRESHOLDS[kind]}+ conflicts`
              }
              onClick={() => dispatch({ type: "pick-kind", kind })}
            >
              {REWARD_LABELS[kind]}
              <span className="text-3xs opacity-70">{REWARD_THRESHOLDS[kind]}+</span>
            </Chip>
          );
        })}
      {isBonus && (
        <Chip pressed tone="emerald" size="sm">
          Bonus cube
        </Chip>
      )}
      {as !== undefined && armedKind !== null && armedKind !== "aggression" && (
        <Chip
          pressed
          tone="amber"
          size="sm"
          variant="outlined"
          onClick={() => dispatch({ type: "pick-kind", kind: armedKind })}
          title="Change clan"
        >
          as {CLAN_KANJI[as]}
        </Chip>
      )}
      {slot?.picksLeft === 2 && (
        <Badge tone="amber" size="xs">
          2 picks left
        </Badge>
      )}
      {pass && (
        <Button variant="secondary" size="xs" onClick={onPass}>
          {isBonus ? "Skip" : "Pass"}
        </Button>
      )}
      {armedKind !== null && (
        <Button variant="ghost" size="xs" onClick={() => dispatch({ type: "cancel" })}>
          Cancel
        </Button>
      )}
      {choosingClan && (
        <>
          <Chip pressed tone="amber" size="sm">
            {REWARD_LABELS[picker.kind]}
          </Chip>
          {emperorClans(legal, picker.kind).map((clan) => (
            <Chip
              key={clan}
              pressed={false}
              tone="amber"
              size="sm"
              variant="outlined"
              icon={
                <span className="h-2 w-2 rounded-full" style={{ background: CLAN_FILL[clan] }} />
              }
              onClick={() => dispatch({ type: "pick-clan", clan })}
            >
              {CLAN_KANJI[clan]} {CLAN_LABELS[clan]}
            </Chip>
          ))}
        </>
      )}
    </div>
  );
}
