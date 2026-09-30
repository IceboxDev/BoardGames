import { openProposal } from "@boardgames/core/games/the-resistance/rules";
import type {
  ResistanceAction,
  ResistancePlayerView,
} from "@boardgames/core/games/the-resistance/types";
import { useEffect, useMemo, useState } from "react";
import { GameScreen, PromptRow } from "../../../../components/game-layout";
import { Button, SegmentedControl, Surface } from "../../../../components/ui";
import { SolverPanel } from "../solver/SolverPanel";
import { HistoryLog } from "./HistoryLog";
import { MissionTrack } from "./MissionTrack";
import { SeatGrid } from "./SeatGrid";

interface ResistanceBoardProps {
  view: ResistancePlayerView;
  legalActions: readonly ResistanceAction[];
  names: readonly string[];
  isAiThinking: boolean;
  onAction: (action: ResistanceAction) => void;
}

export function ResistanceBoard({
  view,
  legalActions,
  names,
  isAiThinking,
  onAction,
}: ResistanceBoardProps) {
  const name = (s: number) => names[s] ?? `P${s + 1}`;
  const record = view.record;
  const onTable = openProposal(record);
  const proposals = legalActions.filter(
    (a): a is Extract<ResistanceAction, { type: "propose" }> => a.type === "propose",
  );
  const picking = proposals.length > 0;
  const missions = useMemo(() => [...new Set(proposals.map((p) => p.mission))], [proposals]);

  const [picks, setPicks] = useState<number[]>([]);
  const [mission, setMission] = useState<number | null>(null);
  const roundKey = `${record.rounds.length}-${record.rounds.at(-1)?.proposals.length ?? 0}`;
  // A new proposal opportunity starts with an empty team.
  useEffect(() => {
    if (roundKey) setPicks([]);
  }, [roundKey]);
  const chosenMission = mission !== null && missions.includes(mission) ? mission : missions[0];
  const propose = proposals.find(
    (p) => p.mission === chosenMission && p.team.join() === [...picks].sort((a, b) => a - b).join(),
  );
  const size = proposals.find((p) => p.mission === chosenMission)?.team.length ?? 0;

  const lastResolved = record.rounds
    .flatMap((r) => r.proposals)
    .filter((p) => p.votes !== null)
    .at(-1);
  const fails = Array.from({ length: 5 }, (_, m) => {
    const result = record.rounds.find((r) => r.result?.mission === m)?.result;
    return result ? result.fails : null;
  });

  const canVote = legalActions.some((a) => a.type === "vote");
  const cards = legalActions.filter(
    (a): a is Extract<ResistanceAction, { type: "play" }> => a.type === "play",
  );
  const pending = view.seats.filter((s) => !s.submitted).length;

  const prompt = (() => {
    if (picking) {
      return (
        <PromptRow
          title="You lead"
          message={`Pick ${size} for mission ${(chosenMission ?? 0) + 1} (${picks.length}/${size})`}
        />
      );
    }
    if (view.phase === "proposing") {
      return (
        <PromptRow
          title={name(view.leader)}
          tone="waiting"
          message="is choosing a team"
          pulse={isAiThinking}
        />
      );
    }
    if (view.phase === "voting") {
      return canVote ? (
        <PromptRow title="Vote" message={`on ${onTable?.team.map(name).join(", ")}`} />
      ) : (
        <PromptRow title="Voting" tone="waiting" message={`${pending} still to vote`} pulse />
      );
    }
    if (view.phase === "mission") {
      return cards.length > 0 ? (
        <PromptRow title="Mission" message="Play your card — nobody sees who played what" />
      ) : (
        <PromptRow
          title="On the mission"
          tone="waiting"
          message={onTable?.team.map(name).join(", ")}
          pulse
        />
      );
    }
    return null;
  })();

  const actionBar = (
    <Surface
      variant="tile"
      padding="md"
      className="flex flex-wrap items-center justify-center gap-3"
    >
      {prompt}
      {picking && missions.length > 1 && (
        <SegmentedControl<number>
          size="xs"
          shape="pill"
          value={chosenMission ?? null}
          onChange={setMission}
          options={missions.map((m) => ({ value: m, label: `M${m + 1}` }))}
        />
      )}
      {picking && (
        <Button
          size="sm"
          variant="primary"
          disabled={!propose}
          onClick={() => propose && onAction(propose)}
        >
          Propose team
        </Button>
      )}
      {canVote && (
        <>
          <Button
            size="sm"
            variant="solid"
            tone="emerald"
            onClick={() => onAction({ type: "vote", approve: true })}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="solid"
            tone="rose"
            onClick={() => onAction({ type: "vote", approve: false })}
          >
            Reject
          </Button>
        </>
      )}
      {cards.map((a) => (
        <Button
          key={a.card}
          size="sm"
          variant="solid"
          tone={a.card === "success" ? "sky" : "rose"}
          onClick={() => onAction(a)}
        >
          {a.card === "success" ? "Success" : "Fail"}
        </Button>
      ))}
      {view.myVote !== null && (
        <span className="text-2xs text-fg-muted">
          You voted {view.myVote ? "approve" : "reject"}
        </span>
      )}
      {view.myCard !== null && (
        <span className="text-2xs text-fg-muted">You played {view.myCard}</span>
      )}
    </Surface>
  );

  const roleLine =
    view.role === "spy"
      ? view.knownSpies.length > 1
        ? `You are a Spy — with ${view.knownSpies
            .filter((s) => s !== view.seat)
            .map(name)
            .join(", ")}`
        : "You are a Spy — you don't know the others"
      : "You are Resistance — you may only play Success";

  return (
    <GameScreen
      background="bg-surface-950"
      contentClassName="mx-auto w-full max-w-5xl"
      leftSidebar={view.liveSolver ? <SolverPanel view={view} names={names} /> : undefined}
      leftSidebarTitle={view.liveSolver ? "Solver" : undefined}
      sidebar={<HistoryLog record={record} names={names} />}
      actionBar={actionBar}
    >
      <p
        className={
          view.role === "spy"
            ? "text-center text-sm font-semibold text-rose-300"
            : "text-center text-sm font-semibold text-sky-300"
        }
      >
        {roleLine}
      </p>
      <MissionTrack
        playerCount={view.playerCount}
        results={view.missionResults}
        fails={fails}
        current={onTable?.mission ?? (picking ? (chosenMission ?? null) : null)}
        rejections={view.rejections}
      />
      <SeatGrid
        view={view}
        names={names}
        team={picking ? picks : (onTable?.team ?? [])}
        lastVotes={lastResolved?.votes ?? null}
        onToggle={
          picking
            ? (seat) =>
                setPicks((cur) =>
                  cur.includes(seat)
                    ? cur.filter((s) => s !== seat)
                    : cur.length < size
                      ? [...cur, seat]
                      : cur,
                )
            : undefined
        }
      />
    </GameScreen>
  );
}
