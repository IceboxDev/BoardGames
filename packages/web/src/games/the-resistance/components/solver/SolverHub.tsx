import { tablePosition } from "@boardgames/core/games/the-resistance/rules";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  EmptyState,
  InteractiveCard,
  PageHeader,
  PageMain,
  Section,
  SelectableCard,
} from "../../../../components/ui";
import { apiClient } from "../../../../lib/api-client";
import { SOLVER_BASE } from "../../logic/solver";
import { deleteTable, loadTables, newTableId, saveTable } from "../../logic/storage";
import { emptyRecord } from "../../logic/table-entry";

/**
 * The Solver's front door: start entering a tabletop game, reopen one, or
 * analyse a finished online match.
 */
export default function SolverHub() {
  const navigate = useNavigate();
  const [tables, setTables] = useState(loadTables);
  const matches = useQuery({
    queryKey: ["game-replays", "the-resistance"],
    queryFn: ({ signal }) => apiClient.getGameReplays("the-resistance", signal),
  });

  const startTable = () => {
    const id = newTableId();
    saveTable({
      id,
      title: `Game of ${new Date().toLocaleDateString()}`,
      updatedAt: Date.now(),
      me: null,
      knownSpies: [],
      record: emptyRecord(),
    });
    navigate(`${SOLVER_BASE}/table/${id}`);
  };

  return (
    <PageMain width="6xl" className="flex flex-col gap-8 pb-12">
      <PageHeader
        size="lg"
        eyebrow="The Resistance"
        title="Solver"
        subtitle="Every possible set of spies, weighed by mission results, the rules and your assumptions — proofs, odds, best teams and misplays. The social reads are yours."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectableCard
          tone="amber"
          title="Enter a tabletop game"
          description="Record proposals, votes and fail cards as you play; the analysis follows live."
          onClick={startTable}
        />
        <SelectableCard
          tone="emerald"
          title="Play online"
          description="Rooms for 5–10 with a live Solver rail; bots fill empty seats."
          onClick={() => navigate("/play/the-resistance/mp/join")}
        />
      </div>

      <Section title="Tabletop games" count={tables.length}>
        {tables.length === 0 ? (
          <EmptyState title="No tabletop games yet" description="Start one above while you play." />
        ) : (
          <ul className="flex flex-col gap-2">
            {tables.map((t) => {
              const pos = tablePosition(t.record);
              return (
                <li key={t.id} className="flex items-center gap-2">
                  <InteractiveCard
                    padding="sm"
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-left"
                    onClick={() => navigate(`${SOLVER_BASE}/table/${t.id}`)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg-primary">
                        {t.title || "Untitled game"}
                      </span>
                      <span className="text-2xs text-fg-muted">
                        {t.record.playerCount} players · {pos.successes}–{pos.fails} ·{" "}
                        {new Date(t.updatedAt).toLocaleString()}
                      </span>
                    </span>
                    {pos.winner && (
                      <Badge size="xs" tone={pos.winner === "resistance" ? "sky" : "rose"}>
                        {pos.winner === "resistance" ? "Resistance won" : "Spies won"}
                      </Badge>
                    )}
                  </InteractiveCard>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      deleteTable(t.id);
                      setTables(loadTables());
                    }}
                  >
                    Delete
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Online matches" count={matches.data?.length}>
        {matches.error ? (
          <EmptyState title="Couldn't load your matches" />
        ) : !matches.data || matches.data.length === 0 ? (
          <EmptyState
            title={matches.data ? "No online games yet" : "Loading matches…"}
            description="Finished games in rooms show up here."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {matches.data.map((m) => {
              const outcome = m.outcome;
              const spiesWon = outcome.kind === "teams" && outcome.winningTeam === 1;
              return (
                <li key={m.id}>
                  <InteractiveCard
                    padding="sm"
                    className="flex w-full items-center gap-3 text-left"
                    onClick={() => navigate(`${SOLVER_BASE}/match/${m.id}`)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-fg-primary">
                        {new Date(m.createdAt).toLocaleString()}
                      </span>
                      <span className="text-2xs text-fg-muted">{m.playerCount} players</span>
                    </span>
                    <Badge size="xs" tone={spiesWon ? "rose" : "sky"}>
                      {spiesWon ? "Spies won" : "Resistance won"}
                    </Badge>
                  </InteractiveCard>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </PageMain>
  );
}
