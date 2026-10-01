import type {
  ResistancePlayerView,
  ResistanceResult,
} from "@boardgames/core/games/the-resistance/types";
import { useMemo, useState } from "react";
import { type GameOverAction, GameOverLayout } from "../../../components/game-over";
import { Badge, Button, PageMain } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { finishedPerspectives, seatNamer } from "../logic/solver";
import { SolverDashboard } from "./solver/SolverDashboard";

const REASON = {
  "three-successes": "Three missions succeeded.",
  "three-fails": "Three missions were sabotaged.",
  "five-rejections": "Five teams in a row were voted down.",
} as const;

export function GameOver({
  view,
  result,
  names,
  actions,
}: {
  view: ResistancePlayerView;
  result: ResistanceResult | null;
  names: readonly string[];
  actions: readonly GameOverAction[];
}) {
  const [analysing, setAnalysing] = useState(false);
  const record = useMemo(
    () => ({ ...view.record, names: [...names], roles: result?.roles ?? view.record.roles }),
    [view.record, names, result],
  );
  const name = useMemo(() => seatNamer(names), [names]);
  const winner = result?.winner ?? view.record.winner;
  const myRole = view.role;
  const won = winner !== null && winner !== undefined && myRole === winner;

  if (analysing) {
    return (
      <PageMain width="full" padding="tight" className="overflow-y-auto">
        <SolverDashboard
          record={record}
          perspectives={finishedPerspectives(record, name)}
          header={
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-lg font-semibold text-fg-strong">Game analysis</h1>
              <Button size="sm" variant="secondary" onClick={() => setAnalysing(false)}>
                Back
              </Button>
            </div>
          }
        />
      </PageMain>
    );
  }

  return (
    <GameOverLayout
      headline={winner === "resistance" ? "The Resistance wins" : "The Spies win"}
      headlineColor={myRole === null ? "neutral" : won ? "win" : "lose"}
      subtitle={REASON[result?.winReason ?? view.record.winReason ?? "three-fails"]}
      actions={[
        { label: "Analyze in Solver", variant: "secondary", onClick: () => setAnalysing(true) },
        ...actions,
      ]}
    >
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(record.roles ?? []).map((role, seat) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: seats are positional
            key={seat}
            className={cn(
              "flex items-center justify-between gap-2 rounded-card-md border px-3 py-2",
              role === "spy" ? "border-rose-500/40" : "border-sky-400/40",
            )}
          >
            <span className="truncate text-sm text-fg-primary">{name(seat)}</span>
            <Badge size="xs" tone={role === "spy" ? "rose" : "sky"}>
              {role === "spy" ? "Spy" : "Resistance"}
            </Badge>
          </li>
        ))}
      </ul>
    </GameOverLayout>
  );
}
