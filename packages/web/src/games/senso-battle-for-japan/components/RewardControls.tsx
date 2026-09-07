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
import { PromptRow } from "../../../components/game-layout";
import { Badge, Button, Chip } from "../../../components/ui";
import { CLAN_FILL } from "../colors";
import { emperorClans, kindAvailable, passAction } from "../logic/legal";
import { type PickerEvent, type PickerState, pickerAs } from "../logic/reward-picker";

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
    case "clan":
      return "Choose the clan to act as";
    case "kind":
      return "Choose a reward";
    case "balance-source":
      return "Pick one of your cubes";
    case "balance-dest":
      return "Swap up, march to a neighbour, or push out its lowest cube";
    case "target":
      return picker.kind === "determination"
        ? "Pick a region to reinforce"
        : picker.kind === "aggression"
          ? "Pick an enemy cube to strike"
          : "Place your bonus cube in any region";
    default:
      return "";
  }
}

/** The acting player's reward chooser — lives in the fan-actions row. */
export default function RewardControls({ legal, picker, dispatch, slot, onPass, note }: Props) {
  const as = pickerAs(picker);
  const pass = passAction(legal);

  if (picker.step === "clan") {
    return (
      <PromptRow title="Emperor" message={hintFor(picker)}>
        {emperorClans(legal).map((clan) => (
          <Chip
            key={clan}
            pressed={false}
            tone="amber"
            size="sm"
            variant="outlined"
            icon={<span className="h-2 w-2 rounded-full" style={{ background: CLAN_FILL[clan] }} />}
            onClick={() => dispatch({ type: "pick-clan", clan })}
          >
            {CLAN_KANJI[clan]} {CLAN_LABELS[clan]}
          </Chip>
        ))}
        {pass && (
          <Button variant="secondary" size="xs" onClick={onPass}>
            Pass
          </Button>
        )}
      </PromptRow>
    );
  }

  const armedKind: RewardKind | null =
    picker.step === "balance-source" || picker.step === "balance-dest"
      ? "balance"
      : picker.step === "target" && picker.kind !== "bonus"
        ? picker.kind
        : null;
  const isBonus = picker.step === "target" && picker.kind === "bonus";
  const canCancel =
    picker.step === "balance-dest" ||
    (picker.step === "target" && !isBonus) ||
    picker.step === "balance-source";

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {as !== undefined && (
        <Chip
          pressed
          tone="amber"
          size="sm"
          variant="outlined"
          onClick={() => dispatch({ type: "cancel" })}
          title="Change clan"
        >
          as {CLAN_KANJI[as]}
        </Chip>
      )}
      {!isBonus &&
        KINDS.map((kind) => {
          const available = kindAvailable(legal, kind, as);
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
      {canCancel && (
        <Button variant="ghost" size="xs" onClick={() => dispatch({ type: "cancel" })}>
          Cancel
        </Button>
      )}
      <span className="w-full text-center text-2xs text-fg-muted">{hintFor(picker)}</span>
      {note && <span className="w-full text-center text-2xs text-amber-300">{note}</span>}
    </div>
  );
}
