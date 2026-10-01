import type { SeatNamer } from "@boardgames/core/games/the-resistance/solver/deductions";
import { pct } from "../../logic/solver";

/**
 * P(both spies) for every pair — the diagonal is each seat's own P(spy).
 * Dark = the pair can't both be spies; bright = they probably are.
 */
export function PairMatrix({ pairs, name }: { pairs: readonly number[][]; name: SeatNamer }) {
  const n = pairs.length;
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-2xs">
        <thead>
          <tr>
            <th />
            {pairs.map((_, b) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: seats are positional
              <th key={b} className="px-0.5 font-normal text-fg-muted" scope="col">
                {name(b).slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pairs.map((row, a) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: seats are positional
            <tr key={a}>
              <th scope="row" className="pr-1 text-right font-normal text-fg-muted">
                {name(a).slice(0, 6)}
              </th>
              {row.map((p, b) => (
                <td
                  // biome-ignore lint/suspicious/noArrayIndexKey: seats are positional
                  key={b}
                  title={
                    a === b
                      ? `${name(a)}: ${pct(p)} spy`
                      : `${name(a)} & ${name(b)} both spies: ${pct(p)}`
                  }
                  className="h-6 w-6 rounded-ui-md text-center tabular-nums text-fg-strong"
                  style={{
                    background: `color-mix(in oklab, var(--color-rose-500) ${Math.round(p * 85)}%, var(--color-surface-900))`,
                    opacity: a === b ? 0.7 : 1,
                  }}
                >
                  {n <= 7 && p >= 0.01 ? Math.round(p * 100) : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
