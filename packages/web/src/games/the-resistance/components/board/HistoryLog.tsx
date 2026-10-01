import type { ResistanceRecord } from "@boardgames/core/games/the-resistance/record";
import { isApproved } from "@boardgames/core/games/the-resistance/rules";
import { Eyebrow } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";

/** Every proposal, who rejected it, and each mission's fail count — newest first. */
export function HistoryLog({
  record,
  names,
}: {
  record: ResistanceRecord;
  names: readonly string[];
}) {
  const name = (s: number) => names[s] ?? `P${s + 1}`;
  const n = record.playerCount;
  const rounds = record.rounds
    .map((round, r) => ({ round, r }))
    .filter(({ round }) => round.proposals.length > 0)
    .reverse();
  if (rounds.length === 0) {
    return <p className="text-xs text-fg-muted">The first leader is choosing a team.</p>;
  }
  return (
    <ol className="flex flex-col gap-4">
      {rounds.map(({ round, r }) => (
        <li key={r} className="flex flex-col gap-1.5">
          <Eyebrow size="sm">
            Round {r + 1} · Mission {(round.proposals[0]?.mission ?? 0) + 1}
          </Eyebrow>
          {round.result && (
            <p
              className={cn(
                "text-xs font-semibold",
                round.result.success ? "text-sky-300" : "text-rose-300",
              )}
            >
              {round.result.success ? "Success" : "Sabotaged"} — {round.result.fails} fail
              {round.result.fails === 1 ? "" : "s"}
            </p>
          )}
          <ol className="flex flex-col gap-1">
            {round.proposals
              .map((p, i) => ({ p, i }))
              .reverse()
              .map(({ p, i }) => {
                const rejecters = p.votes?.flatMap((v, s) => (v ? [] : [name(s)])) ?? [];
                return (
                  <li key={`proposal-${r}-${i}`} className="text-xs text-fg-secondary">
                    <span className="text-fg-primary">{name(p.leader)}</span> →{" "}
                    {p.team.map(name).join(", ")}
                    {p.votes === null ? (
                      <span className="text-fg-muted"> · voting…</span>
                    ) : (
                      <span
                        className={isApproved(p.votes, n) ? "text-emerald-300" : "text-amber-300"}
                      >
                        {" "}
                        · {isApproved(p.votes, n) ? "approved" : "rejected"}
                      </span>
                    )}
                    {rejecters.length > 0 && (
                      <span className="block text-2xs text-fg-muted">
                        No: {rejecters.join(", ")}
                      </span>
                    )}
                  </li>
                );
              })}
          </ol>
        </li>
      ))}
    </ol>
  );
}
