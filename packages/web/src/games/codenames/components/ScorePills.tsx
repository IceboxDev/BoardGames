import { TEAM_BG, TEAM_TEXT, teamName } from "../logic/labels";
import type { TeamScore } from "../logic/table";
import { ScorePill } from "../table";

// The race in two pills for the clue strip's right end, below the wide
// layout (where the Teams rail is a sheet away).

export function ScorePills({ score }: { score: readonly TeamScore[] }) {
  return (
    <>
      <span className="sr-only">Agents left to find:</span>
      {score.map((s) => (
        <ScorePill
          key={s.team}
          dotClass={TEAM_BG[s.team]}
          label={teamName(s.team)}
          labelClass={TEAM_TEXT[s.team]}
          value={s.left}
          active={s.active}
          title={`${teamName(s.team)}: ${s.left} of ${s.total} agents still to find`}
        />
      ))}
    </>
  );
}
