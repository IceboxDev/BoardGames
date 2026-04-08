interface ScoreBoardProps {
  playerCount: number;
  roundScores: number[][];
  totalScores: number[];
  myIndex: number;
}

export default function ScoreBoard({
  playerCount,
  roundScores,
  totalScores,
  myIndex,
}: ScoreBoardProps) {
  if (roundScores.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Scores</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500">
            <th className="pb-1 text-left font-medium">Player</th>
            {roundScores.map((_, r) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static score table
              <th key={r} className="pb-1 text-right font-medium">
                R{r + 1}
              </th>
            ))}
            <th className="pb-1 text-right font-bold">Total</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: playerCount }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static score table
            <tr key={i} className={i === myIndex ? "text-orange-300" : "text-gray-300"}>
              <td className="py-0.5 font-medium">{i === myIndex ? "You" : `P${i + 1}`}</td>
              {roundScores.map((rs, r) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static score table
                <td key={r} className="py-0.5 text-right tabular-nums">
                  {rs[i]}
                </td>
              ))}
              <td className="py-0.5 text-right font-bold tabular-nums">{totalScores[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
