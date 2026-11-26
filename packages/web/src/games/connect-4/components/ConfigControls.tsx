import {
  BEST_OF,
  type BestOf,
  BOARD_SIZES,
  type BoardSize,
  type Connect4Config,
  FIRST_PLAYER_CHOICES,
} from "@boardgames/core/games/connect-4/manifest";
import { ControlGroup } from "../../../components/setup/ControlGroup";
import type { SetupOption } from "../../../components/setup/SetupOptions";
import { SegmentedControl } from "../../../components/ui";

interface Props {
  value: Connect4Config;
  onChange: (next: Connect4Config) => void;
  disabled?: boolean;
  /** Seat words for "who opens": solo says You / AI, a room Red / Yellow. */
  openerLabels: { seat0: string; seat1: string };
}

const BOARD_LABELS: Record<BoardSize, string> = {
  "7x6": "7×6 classic",
  "6x5": "6×5",
  "8x7": "8×7",
};
const BEST_OF_LABELS: Record<BestOf, string> = { 1: "Single game", 3: "Best of 3", 5: "Best of 5" };

/** The table's options as fields: the solo setup lays them out across its panel. */
export function connect4OptionFields({
  value,
  onChange,
  disabled,
  openerLabels,
}: Props): SetupOption[] {
  const set = (patch: Partial<Connect4Config>) => onChange({ ...value, ...patch });
  const openerWords = { ...openerLabels, random: "Random" };
  const seg = <T extends string | number>(
    label: string,
    options: readonly { value: T; label: string }[],
    current: T,
    pick: (value: T) => void,
  ) => (
    <SegmentedControl<T>
      options={options}
      value={current}
      onChange={pick}
      disabled={disabled}
      size="sm"
      fullWidth
      aria-label={label}
    />
  );
  return [
    {
      id: "board",
      label: "Board",
      control: seg(
        "Board",
        BOARD_SIZES.map((b) => ({ value: b, label: BOARD_LABELS[b] })),
        value.board,
        (board) => set({ board }),
      ),
      note:
        value.board === "8x7"
          ? "Too big to solve from the start: hints are the AI's best guess until the middle game."
          : null,
    },
    {
      id: "match",
      label: "Match",
      control: seg(
        "Match",
        BEST_OF.map((n) => ({ value: n, label: BEST_OF_LABELS[n] })),
        value.bestOf,
        (bestOf) => set({ bestOf }),
      ),
      note: value.bestOf > 1 ? "The opener alternates from game to game." : null,
    },
    {
      id: "opener",
      label: value.bestOf > 1 ? "Opens game 1" : "Opens the game",
      control: seg(
        "Opens the game",
        FIRST_PLAYER_CHOICES.map((c) => ({ value: c, label: openerWords[c] })),
        value.firstPlayer,
        (firstPlayer) => set({ firstPlayer }),
      ),
    },
    {
      id: "rules",
      label: "Rules",
      control: seg(
        "Rules",
        [
          { value: "classic", label: "Classic" },
          { value: "popout", label: "PopOut" },
        ],
        value.popOut ? "popout" : "classic",
        (rules) => set({ popOut: rules === "popout" }),
      ),
      note: value.popOut
        ? "On your turn, drop a disc or pop one of your own out of the bottom row. A threefold repeat is a draw."
        : null,
    },
    {
      id: "assists",
      label: "Assists",
      span: "full",
      control: seg(
        "Assists",
        [
          { value: "on", label: "Hints & analysis" },
          { value: "off", label: "Off" },
        ],
        value.assists ? "on" : "off",
        (assists) => set({ assists: assists === "on" }),
      ),
      note: value.assists
        ? `A hint button, the solver's evaluation bar${value.popOut ? "" : ", and every move graded after the game"}.`
        : "No hints, no evaluation — just the game.",
    },
  ];
}

/** The same fields in labelled groups — the room lobby's layout. */
export function ConfigControls(props: Props) {
  return (
    <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-2">
      {connect4OptionFields(props).map((field) => (
        <div key={field.id} className={field.span === "full" ? "sm:col-span-2" : undefined}>
          <ControlGroup label={String(field.label)}>
            <div className="flex flex-col gap-2">
              {field.control}
              {field.note && <p className="text-xs leading-snug text-fg-muted">{field.note}</p>}
            </div>
          </ControlGroup>
        </div>
      ))}
    </div>
  );
}
