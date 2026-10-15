/**
 * One opening tree: build it (and pause / continue), choose your moves where
 * the tree waits for you, and browse it move by move.
 */
import {
  type RepertoireTree,
  type UserChoice,
  withChoice,
} from "@boardgames/core/games/chess/trainer/tree";
import type { Repertoire } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Badge,
  Button,
  ErrorAlert,
  PageHeader,
  PageMain,
  ProgressBar,
  QueryBoundary,
  StatTile,
  Surface,
} from "../../../components/ui";
import useDocumentTitle from "../../../hooks/useDocumentTitle";
import { chessKeys, repertoireQuery } from "./api";
import { DecisionPanel } from "./DecisionPanel";
import { startLichessLogin } from "./lichess/oauth";
import { TRAINER_BASE } from "./paths";
import { TreeBrowser } from "./TreeBrowser";
import { decisionKeys } from "./tree-nav";
import { useLichessToken } from "./useLichessToken";
import { type TreeBuild, useTreeBuild } from "./useTreeBuild";

export default function RepertoirePage() {
  const { id = "" } = useParams();
  const query = useQuery({ queryKey: chessKeys.repertoire(id), queryFn: repertoireQuery(id) });
  return (
    <PageMain width="wide" className="flex flex-col gap-6 pb-12">
      <QueryBoundary query={query} loadingLabel="Opening the tree…">
        {(rep) => <RepertoireView rep={rep} />}
      </QueryBoundary>
    </PageMain>
  );
}

function RepertoireView({ rep }: { rep: Repertoire }) {
  useDocumentTitle(`${rep.name} · Opening trainer`);
  const navigate = useNavigate();
  const [token] = useLichessToken();
  const build = useTreeBuild(rep, token);
  const tree = build.tree;
  // A choice made while the build runs: applied once it has paused.
  const [pending, setPending] = useState<{ key: string; choice: UserChoice } | null>(null);

  const choose = (key: string, choice: UserChoice) => {
    if (!tree) return;
    if (build.phase === "idle") {
      build.build(withChoice(tree, key, choice));
      return;
    }
    setPending({ key, choice });
    build.stop();
  };

  useEffect(() => {
    if (!pending || build.phase !== "idle" || !build.tree) return;
    setPending(null);
    build.build(withChoice(build.tree, pending.key, pending.choice));
  }, [pending, build]);

  const decisions = useMemo(() => (tree ? decisionKeys(tree) : []), [tree]);
  const decision = decisions[0];

  return (
    <>
      <PageHeader
        eyebrow={rep.color === "w" ? "Opening tree · White" : "Opening tree · Black"}
        title={rep.name}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate(TRAINER_BASE)}>
            All trees
          </Button>
        }
      />
      {!token && (
        <Surface variant="tile" padding="lg" className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-fg-secondary">
            Building uses lichess's explorer and cloud analysis — connect lichess in this browser to
            build or change this tree.
          </p>
          <Button size="sm" onClick={() => void startLichessLogin()}>
            Connect lichess
          </Button>
        </Surface>
      )}
      <BuildBar build={build} tree={tree} canBuild={!!token} />
      {build.error && <ErrorAlert message={build.error} />}
      {tree && <Stats tree={tree} />}
      {tree && decision && (
        <DecisionPanel
          key={decision}
          tree={tree}
          nodeKey={decision}
          remaining={decisions.length}
          providers={build.providers}
          busy={pending !== null}
          onChoose={(choice) => choose(decision, choice)}
        />
      )}
      {tree && Object.keys(tree.nodes).length > 0 && (
        <TreeBrowser
          tree={tree}
          editable={!!token}
          onChange={(key, choice) => choose(key, choice)}
        />
      )}
    </>
  );
}

/** The farm's progress on this tree, with a rough time left. */
function farmText(farm: TreeBuild["farm"]): string {
  if (!farm) return "Waiting for the analysis farm…";
  const ahead = farm.queued + farm.running;
  const alive = farm.lastSeen !== null && Date.now() - Date.parse(farm.lastSeen) < 10 * 60_000;
  const eta =
    farm.avgSeconds !== null && ahead > 0
      ? ` · about ${formatHours((ahead * farm.avgSeconds) / 3600)} for the whole queue`
      : "";
  return alive
    ? `The analysis farm is working: ${farm.waiting.toLocaleString()} of this tree's positions waiting, ${ahead.toLocaleString()} in its queue${eta}. The tree grows as results arrive.`
    : `${farm.waiting.toLocaleString()} positions queued for the analysis farm, which is offline right now. They'll be analysed when it's back.`;
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return `${(h / 24).toFixed(1)} days`;
}

function BuildBar({
  build,
  tree,
  canBuild,
}: {
  build: TreeBuild;
  tree: RepertoireTree | null;
  canBuild: boolean;
}) {
  const p = build.progress;
  const running = build.phase !== "idle";
  const label =
    build.phase === "loading"
      ? "Loading your games…"
      : build.phase === "indexing"
        ? `Indexing your games… ${build.indexing?.done.toLocaleString() ?? 0} / ${build.indexing?.total.toLocaleString() ?? "?"}`
        : build.phase === "stopping"
          ? "Pausing after this position…"
          : build.phase === "building" && p
            ? `${p.nodes.toLocaleString()} positions · ${p.settled.toLocaleString()} of ${p.games.toLocaleString()} games placed · ${p.engineCalls.toLocaleString()} engine looks · ${p.popularCalls.toLocaleString()} explorer looks`
            : build.phase === "building"
              ? "Starting…"
              : tree?.status === "analysing"
                ? farmText(build.farm)
                : tree?.status === "ready"
                  ? "Built. Rebuild after pulling new games to fold them in."
                  : tree?.status === "decisions"
                    ? "Waiting for your moves below."
                    : tree?.status === "generating"
                      ? "Paused part-way."
                      : "Not built yet.";
  const action = !tree ? "Build tree" : tree.status === "generating" ? "Continue" : "Rebuild";

  return (
    <Surface variant="raised" padding="lg" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-fg-secondary">{label}</p>
        {running ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={build.stop}
            disabled={build.phase !== "building"}
          >
            Pause
          </Button>
        ) : (
          <Button size="sm" onClick={() => build.build()} disabled={!canBuild}>
            {action}
          </Button>
        )}
      </div>
      {running && (
        <ProgressBar
          label="Build progress"
          value={
            build.phase === "indexing" && build.indexing
              ? build.indexing.done / Math.max(1, build.indexing.total)
              : p
                ? p.settled / Math.max(1, p.games)
                : 0
          }
          animate
        />
      )}
    </Surface>
  );
}

function Stats({ tree }: { tree: RepertoireTree }) {
  const s = tree.stats;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="Games" value={s.games.toLocaleString()} />
      <StatTile
        label="Average stay in tree"
        value={`${s.avgFollowPlies} plies`}
        sub="before your own move left it"
      />
      <StatTile
        label="Left the tree"
        value={s.deviated.toLocaleString()}
        sub={`${s.ended.toLocaleString()} followed it to their end`}
      />
      <StatTile
        label="Positions"
        value={Object.keys(tree.nodes).length.toLocaleString()}
        sub={
          s.decisions > 0 ? (
            <Badge tone="amber" size="xs">
              {s.decisions} waiting for you
            </Badge>
          ) : undefined
        }
      />
    </div>
  );
}
