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
  note?: string | null;
}

const KINDS: RewardKind[] = ["balance", "determination", "aggression"];

function hintFor(picker: PickerState): string {
  switch (picker.step) {
    case "kind":
      return "Choose a reward";
    case "clan":
      return picker.kind === "balance" ? "Whose cube will you move?" : "Whose cube will you place?";
    case "balance-source":
      return picker.as === undefined
        ? "Pick one of your cubes"
        : `Pick a ${CLAN_LABELS[picker.as]} cube to move`;
    case "balance-dest":
      return "Swap up, march to a neighbour or push out its lowest cube — or pick another cube";
    case "target":
      switch (picker.kind) {
        case "determination":
          return "Pick a region to reinforce";
        case "aggression":
          return picker.emperor
            ? "Pick any cube to strike — it leaves the map"
            : "Pick an enemy cube to strike";
        case "bonus":
          return "Place your bonus cube in any region";
      }
      return "";
    default:
      return "";
  }
}

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

/** The acting player's reward chooser — lives in the fan-actions row. */
export default function RewardControls({ legal, picker, dispatch, slot, onPass, note }: Props) {
  const as = pickerAs(picker);
  const pass = passAction(legal);
  const emperor = isEmperorPicker(picker);
  const isBonus = picker.step === "target" && picker.kind === "bonus";
  const armedKind = armedKindOf(picker);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {emperor && (
        <Badge tone="amber" size="xs">
          Emperor
        </Badge>
      )}
      {!isBonus &&
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
      {picker.step === "clan" && (
        <div className="flex w-full flex-wrap items-center justify-center gap-2">
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
        </div>
      )}
      <span className="w-full text-center text-2xs text-fg-muted">{hintFor(picker)}</span>
      {note && <span className="w-full text-center text-2xs text-amber-300">{note}</span>}
    </div>
  );
}
