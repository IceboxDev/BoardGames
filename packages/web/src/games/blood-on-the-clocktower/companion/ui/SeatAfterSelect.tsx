import { Select } from "../../../../components/ui";

// "Where do they sit?" — a chair picker phrased as the gap between two
// neighbours, in clockwise order. Value is the seat they sit AFTER; null is
// the first chair. Used when a traveller joins mid-game, when a late player
// is seated at the bag stage, and when a player changes chairs.
export function SeatAfterSelect({
  id,
  players,
  value,
  onChange,
  exclude,
  label = "Sits after",
}: {
  id: string;
  /** The circle, in seating order. */
  players: ReadonlyArray<{ seat: number; name: string }>;
  value: number | null;
  onChange: (afterSeat: number | null) => void;
  /** A seat that cannot be the anchor (the player being moved). */
  exclude?: number;
  label?: string;
}) {
  const circle = players.filter((p) => p.seat !== exclude);
  const first = circle[0];
  return (
    <Select
      id={id}
      aria-label={label}
      size="sm"
      value={value === null ? "first" : String(value)}
      onChange={(e) => onChange(e.target.value === "first" ? null : Number(e.target.value))}
    >
      {first && <option value="first">First chair — before {first.name}</option>}
      {circle.map((p, i) => {
        const next = circle[(i + 1) % circle.length];
        return (
          <option key={p.seat} value={p.seat}>
            After {p.name}
            {next && next.seat !== p.seat ? ` — before ${next.name}` : ""}
          </option>
        );
      })}
    </Select>
  );
}
