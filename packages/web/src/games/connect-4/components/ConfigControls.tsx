import {
  BEST_OF,
  type BestOf,
  BOARD_SIZES,
  type BoardSize,
  type Connect4Config,
  FIRST_PLAYER_CHOICES,
} from "@boardgames/core/games/connect-4/manifest";
import type { ReactNode } from "react";
import { ControlGroup } from "../../../components/setup/ControlGroup";
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

/** One labelled option: a full-width segmented choice, and a line on what the choice means. */
function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
  note,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  note?: ReactNode;
}) {
  return (
    <ControlGroup label={label}>
      <div className="flex flex-col gap-2">
        <SegmentedControl<T>
          options={options}
          value={value}
          onChange={onChange}
          disabled={disabled}
          size="sm"
          fullWidth
          aria-label={label}
        />
        {note && <p className="text-xs leading-snug text-fg-muted">{note}</p>}
      </div>
    </ControlGroup>
  );
}

/** The table's options, shared by the solo setup screen and the room lobby. */
export function ConfigControls({ value, onChange, disabled, openerLabels }: Props) {
  const set = (patch: Partial<Connect4Config>) => onChange({ ...value, ...patch });
  const openerWords = { ...openerLabels, random: "Random" };
  return (
    <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-2">
      <Choice
        label="Board"
        options={BOARD_SIZES.map((b) => ({ value: b, label: BOARD_LABELS[b] }))}
        value={value.board}
        onChange={(board) => set({ board })}
        disabled={disabled}
        note={
          value.board === "8x7"
            ? "Too big to solve from the start: hints are the AI's best guess until the middle game."
            : null
        }
      />
      <Choice
        label="Match"
        options={BEST_OF.map((n) => ({ value: n, label: BEST_OF_LABELS[n] }))}
        value={value.bestOf}
        onChange={(bestOf) => set({ bestOf })}
        disabled={disabled}
        note={value.bestOf > 1 ? "The opener alternates from game to game." : null}
      />
      <Choice
        label={value.bestOf > 1 ? "Opens game 1" : "Opens the game"}
        options={FIRST_PLAYER_CHOICES.map((c) => ({ value: c, label: openerWords[c] }))}
        value={value.firstPlayer}
        onChange={(firstPlayer) => set({ firstPlayer })}
        disabled={disabled}
      />
      <Choice
        label="Rules"
        options={[
          { value: "classic", label: "Classic" },
          { value: "popout", label: "PopOut" },
        ]}
        value={value.popOut ? "popout" : "classic"}
        onChange={(rules) => set({ popOut: rules === "popout" })}
        disabled={disabled}
        note={
          value.popOut
            ? "On your turn, drop a disc or pop one of your own out of the bottom row. A threefold repeat is a draw."
            : null
        }
      />
      <div className="sm:col-span-2">
        <Choice
          label="Assists"
          options={[
            { value: "on", label: "Hints & analysis" },
            { value: "off", label: "Off" },
          ]}
          value={value.assists ? "on" : "off"}
          onChange={(assists) => set({ assists: assists === "on" })}
          disabled={disabled}
          note={
            value.assists
              ? `A hint button, the solver's evaluation bar${value.popOut ? "" : ", and every move graded after the game"}.`
              : "No hints, no evaluation — just the game."
          }
        />
      </div>
    </div>
  );
}
