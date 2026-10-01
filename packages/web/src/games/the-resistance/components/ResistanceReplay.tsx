import { ResistanceReplayLogSchema } from "@boardgames/core/games/the-resistance/record";
import { useMemo } from "react";
import { Button, ErrorAlert, PageMain } from "../../../components/ui";
import type { ReplayProps } from "../../types";
import { finishedPerspectives, seatNamer } from "../logic/solver";
import { SolverDashboard } from "./solver/SolverDashboard";

/** A finished online match, opened straight into the Solver. */
export default function ResistanceReplay({ game, onBack }: ReplayProps) {
  const parsed = useMemo(() => ResistanceReplayLogSchema.safeParse(game), [game]);
  if (!parsed.success) {
    return (
      <PageMain width="md">
        <ErrorAlert message="This replay isn't a Resistance game log." />
      </PageMain>
    );
  }
  return <ReplayDashboard record={parsed.data} onBack={onBack} />;
}

export function ReplayDashboard({
  record,
  onBack,
  names,
}: {
  record: ReturnType<typeof ResistanceReplayLogSchema.parse>;
  onBack?: () => void;
  names?: readonly (string | null)[];
}) {
  const named = useMemo(
    () => (names ? { ...record, names: names.map((n, i) => n ?? `P${i + 1}`) } : record),
    [record, names],
  );
  const perspectives = useMemo(() => finishedPerspectives(named, seatNamer(named.names)), [named]);
  return (
    <PageMain width="full" padding="tight" className="overflow-y-auto">
      <SolverDashboard
        record={named}
        perspectives={perspectives}
        header={
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold text-fg-strong">
              {record.winner === "resistance" ? "Resistance win" : "Spy win"} · {record.playerCount}{" "}
              players
            </h1>
            {onBack && (
              <Button size="sm" variant="secondary" onClick={onBack}>
                Back
              </Button>
            )}
          </div>
        }
      />
    </PageMain>
  );
}
