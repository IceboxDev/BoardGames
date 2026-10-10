import type { GameRecord } from "@boardgames/core/games/connect-4/types";
import { SegmentedControl } from "../../../../components/ui";
import { colourName } from "../../logic/text";

interface Props {
  games: readonly GameRecord[];
  value: number;
  onChange: (index: number) => void;
}

/** Which game of a series the analysis board shows. */
export function SeriesPicker({ games, value, onChange }: Props) {
  return (
    <SegmentedControl
      options={games.map((g, i) => ({
        value: i,
        label: `Game ${i + 1} · ${g.winner === null ? "draw" : `${colourName(g.winner)} won`}`,
      }))}
      value={value}
      onChange={onChange}
      size="sm"
    />
  );
}
