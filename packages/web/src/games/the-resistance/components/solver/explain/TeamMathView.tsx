import { RULE_INFO } from "@boardgames/core/games/the-resistance/solver/assumptions";
import type { SeatNamer } from "@boardgames/core/games/the-resistance/solver/deductions";
import type { TeamMath } from "@boardgames/core/games/the-resistance/solver/explain";
import { Badge, Eyebrow } from "../../../../../components/ui";
import { pct } from "../../../logic/solver";

const pct1 = (p: number) => `${(p * 100).toFixed(1)}%`;

/** "(1 − q)^k" — the chance none (or fewer than two) of k spies fail. */
function successFormula(k: number, needed: number): string {
  if (k === 0) return "no spy — always succeeds";
  const none = k === 1 ? "(1 − q)" : `(1 − q)^${k}`;
  if (needed === 1) return `nobody fails: ${none}`;
  const one = k === 1 ? "q" : `${k}·q·(1 − q)${k - 1 > 1 ? `^${k - 1}` : ""}`;
  return k === 1 ? "a lone spy can't reach 2 Fails: 1" : `fewer than 2 Fail: ${none} + ${one}`;
}

/**
 * P(success) taken apart: the spy sets still possible, grouped by how many
 * spies they put on this team, each group weighted by its likelihood and by
 * the chance that many independent spies still leave the mission standing.
 */
export function TeamMathView({
  math,
  name,
  caption,
}: {
  math: TeamMath;
  name: SeatNamer;
  caption?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-fg-strong">
          {math.team.map(name).join(", ")}
          <span className="font-normal text-fg-muted"> · mission {math.mission + 1}</span>
        </span>
        <span className="text-xs text-fg-secondary">
          <span className="font-semibold text-sky-300">{pct1(math.pSuccess)}</span> succeeds ·{" "}
          {pct1(math.pClean)} clean
        </span>
      </div>
      {caption && <p className="text-2xs text-fg-muted">{caption}</p>}

      <div className="flex flex-wrap gap-1.5">
        {math.members.map((m) => (
          <Badge
            key={m.seat}
            size="xs"
            tone={m.proven === "spy" ? "rose" : m.proven === "resistance" ? "sky" : "neutral"}
          >
            {name(m.seat)} {m.proven ? (m.proven === "spy" ? "spy" : "clean") : pct(m.pSpy)}
          </Badge>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-2xs tabular-nums">
          <thead className="text-fg-muted">
            <tr>
              <th className="py-1 pr-2 font-normal">Spies aboard (k)</th>
              <th className="py-1 pr-2 font-normal">Spy sets</th>
              <th className="py-1 pr-2 font-normal">P(k aboard)</th>
              <th className="py-1 pr-2 font-normal">q = one spy's Fail</th>
              <th className="py-1 pr-2 font-normal">P(success | k)</th>
              <th className="py-1 font-normal">Contribution</th>
            </tr>
          </thead>
          <tbody className="text-fg-secondary">
            {math.rows.map((r) => (
              <tr key={r.spies} className="border-t border-line-soft">
                <td className="py-1 pr-2 font-semibold text-fg-primary">{r.spies}</td>
                <td className="py-1 pr-2">
                  {r.worlds} of {math.aliveWorlds}
                </td>
                <td className="py-1 pr-2">{pct1(r.pWorlds)}</td>
                <td className="py-1 pr-2">{r.spies === 0 ? "—" : pct1(r.failChance)}</td>
                <td className="py-1 pr-2" title={successFormula(r.spies, math.needed)}>
                  {pct1(r.pSuccessGiven)}
                </td>
                <td className="py-1">{pct1(r.contribution)}</td>
              </tr>
            ))}
            <tr className="border-t border-line text-fg-primary">
              <td className="py-1 pr-2 font-semibold" colSpan={5}>
                P(success) = Σ P(k aboard) × P(success | k)
              </td>
              <td className="py-1 font-semibold text-sky-300">{pct1(math.pSuccess)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1.5">
        <Eyebrow size="sm">How q and P(success | k) come about</Eyebrow>
        <p className="text-2xs text-fg-muted">
          Spies can't agree at the table who plays Fail, so each spy aboard decides on their own
          with chance q. The mission {math.needed > 1 ? "needs 2 Fails" : "fails on a single Fail"}.
        </p>
        <ul className="flex flex-col gap-1 text-2xs text-fg-secondary">
          {math.rows
            .filter((r) => r.spies > 0)
            .map((r) => (
              <li key={r.spies}>
                <span className="font-semibold text-fg-primary">k = {r.spies}:</span>{" "}
                {r.steps
                  .map((st) =>
                    st.rule === null
                      ? `base rate ${pct(st.chance)}`
                      : `${RULE_INFO[st.rule].label} (${st.formula}) → ${pct1(st.chance)}`,
                  )
                  .join("; ")}
                . P(success | {r.spies}) = {successFormula(r.spies, math.needed)} ={" "}
                {pct1(r.pSuccessGiven)}.
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
