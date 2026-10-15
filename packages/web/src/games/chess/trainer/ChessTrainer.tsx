/**
 * The chess opening trainer, at `/play/chess/solo/trainer/*`:
 *   - the hub: connect lichess (first visit), pull every game, list your trees
 *   - `:id`: one opening tree — build it, answer its handpicked positions, browse it
 *
 * lichess sends the browser back here with `?code&state` after sign-in.
 */
import { TreeSettingsSchema } from "@boardgames/core/games/chess/trainer/tree";
import type { LichessLink, RepertoireSummary } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { PlayIcon, TrainerIcon } from "../../../components/icons";
import {
  Badge,
  Button,
  EmptyState,
  ErrorAlert,
  Input,
  LoadingState,
  Modal,
  ModalBody,
  ModalFooter,
  PageHeader,
  PageMain,
  ProgressBar,
  QueryBoundary,
  SegmentedControl,
  SelectableCard,
  StatTile,
  Stepper,
  Surface,
} from "../../../components/ui";
import useDocumentTitle from "../../../hooks/useDocumentTitle";
import { ApiError } from "../../../lib/api-fetch";
import {
  chessKeys,
  createRepertoire,
  linkAccount,
  linkQuery,
  repertoiresQuery,
  unlinkAccount,
} from "./api";
import {
  finishLichessLogin,
  forgetLichessToken,
  OAuthError,
  startLichessLogin,
} from "./lichess/oauth";
import { TRAINER_BASE } from "./paths";
import { useLichessImport } from "./useLichessImport";
import { useLichessToken } from "./useLichessToken";

const RepertoirePage = lazy(() => import("./RepertoirePage"));

export default function ChessTrainer() {
  return (
    <Routes>
      <Route index element={<TrainerHub />} />
      <Route
        path=":id"
        element={
          <Suspense fallback={<LoadingState label="Opening the tree…" fillHeight />}>
            <RepertoirePage />
          </Suspense>
        }
      />
    </Routes>
  );
}

function TrainerHub() {
  useDocumentTitle("Chess · Opening trainer");
  const link = useQuery({ queryKey: chessKeys.link, queryFn: linkQuery });
  const [token, refreshToken] = useLichessToken();
  const callback = useOAuthCallback(refreshToken);
  const importer = useLichessImport(token, refreshToken);

  // A fresh connection pulls every game straight away.
  const autoStarted = useRef(false);
  useEffect(() => {
    const l = link.data?.link;
    if (!callback.justLinked || !l || !token || autoStarted.current) return;
    autoStarted.current = true;
    importer.start(l);
  }, [callback.justLinked, link.data, token, importer]);

  return (
    <PageMain width="wide" className="flex flex-col gap-6 pb-12">
      <PageHeader
        eyebrow="Chess"
        title="Opening trainer"
        subtitle="Your own opening trees, built from every game you've played on lichess."
      />
      {callback.error && <ErrorAlert title="Couldn't connect lichess" message={callback.error} />}
      {callback.busy ? (
        <LoadingState label="Connecting your lichess account…" />
      ) : (
        <QueryBoundary query={link} loadingLabel="Loading…">
          {({ link: l }) =>
            l ? (
              <>
                <AccountCard link={l} token={token} importer={importer} />
                <Repertoires link={l} />
              </>
            ) : (
              <ConnectCard />
            )
          }
        </QueryBoundary>
      )}
    </PageMain>
  );
}

/** Finish a lichess sign-in when the page loads with `?code` / `?error`. */
function useOAuthCallback(onToken: () => void) {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justLinked, setJustLinked] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || (!params.has("code") && !params.has("error"))) return;
    handled.current = true;
    const snapshot = new URLSearchParams(params);
    setParams({}, { replace: true });
    setBusy(true);
    void (async () => {
      try {
        const token = await finishLichessLogin(snapshot);
        const res = await linkAccount(token);
        queryClient.setQueryData(chessKeys.link, res);
        // The page read the (absent) token on mount; pick up the new one.
        onToken();
        setJustLinked(true);
      } catch (err) {
        setError(
          err instanceof OAuthError || err instanceof ApiError
            ? err.message
            : "Something went wrong. Try connecting again.",
        );
      } finally {
        setBusy(false);
      }
    })();
  }, [params, setParams, queryClient, onToken]);

  return { busy, error, justLinked };
}

function ConnectCard() {
  return (
    <Surface variant="raised" padding="xl" className="flex flex-col items-start gap-4">
      <TrainerIcon className="h-10 w-10 text-amber-300" />
      <h2 className="text-xl font-bold text-fg-strong">Connect your lichess account</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm text-fg-secondary">
        <li>We read your public games — every one you've played — to build your trees.</li>
        <li>
          The connection also opens lichess's opening explorer and cloud analysis to the trainer.
        </li>
        <li>
          It can't play, post or change anything on your account. You can disconnect any time.
        </li>
      </ul>
      <Button onClick={() => void startLichessLogin()}>Connect lichess</Button>
    </Surface>
  );
}

function AccountCard({
  link,
  token,
  importer,
}: {
  link: LichessLink;
  token: string | null;
  importer: ReturnType<typeof useLichessImport>;
}) {
  const queryClient = useQueryClient();
  const unlink = useMutation({
    mutationFn: unlinkAccount,
    onSuccess: (res) => {
      forgetLichessToken();
      queryClient.setQueryData(chessKeys.link, res);
    },
  });
  const p = importer.progress;
  const seen = p?.seen ?? 0;

  return (
    <Surface variant="raised" padding="lg" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-fg-muted">Connected lichess account</p>
          <a
            href={`https://lichess.org/@/${link.username}`}
            target="_blank"
            rel="noreferrer"
            className="text-lg font-bold text-fg-strong hover:underline"
          >
            {link.username}
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          {!token ? (
            <Button size="sm" onClick={() => void startLichessLogin()}>
              Reconnect in this browser
            </Button>
          ) : importer.running ? (
            <Button size="sm" variant="secondary" onClick={importer.stop}>
              Pause import
            </Button>
          ) : (
            <Button size="sm" onClick={() => importer.start(link)}>
              {link.gamesCount === 0 ? "Import all games" : "Pull new games"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            loading={unlink.isPending}
            disabled={importer.running}
            onClick={() => unlink.mutate()}
          >
            Disconnect
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Games" value={link.gamesCount.toLocaleString()} />
        <StatTile label="As White" value={link.byColor.w.toLocaleString()} />
        <StatTile label="As Black" value={link.byColor.b.toLocaleString()} />
        <StatTile
          label="Newest"
          value={link.newestGameAt ? new Date(link.newestGameAt).toLocaleDateString() : "—"}
        />
      </div>

      {(importer.running || p) && (
        <div className="flex flex-col gap-2">
          <ProgressBar
            label="Import progress"
            value={importer.total ? Math.min(1, seen / importer.total) : 0}
            animate={importer.running}
          />
          <p className="text-sm text-fg-secondary">
            {importer.running ? "Importing… " : "Import paused. "}
            {seen.toLocaleString()} games read
            {importer.total ? ` of about ${importer.total.toLocaleString()}` : ""},{" "}
            {importer.stored.toLocaleString()} new games saved
            {p && Object.values(p.skipped).some(Boolean)
              ? ` (${Object.values(p.skipped)
                  .reduce((a, b) => a + (b ?? 0), 0)
                  .toLocaleString()} skipped: other variants, set-up positions or no moves)`
              : ""}
            .
          </p>
        </div>
      )}
      {importer.error && <ErrorAlert message={importer.error} />}
      {unlink.isError && <ErrorAlert message="Couldn't disconnect. Try again." />}
    </Surface>
  );
}

const STATUS_TEXT: Record<
  RepertoireSummary["status"],
  { label: string; tone: "neutral" | "amber" | "sky" | "emerald" }
> = {
  new: { label: "Not built", tone: "neutral" },
  generating: { label: "Paused", tone: "sky" },
  analysing: { label: "Analysing on the farm", tone: "sky" },
  decisions: { label: "Needs your moves", tone: "amber" },
  ready: { label: "Ready", tone: "emerald" },
};

function Repertoires({ link }: { link: LichessLink }) {
  const navigate = useNavigate();
  const list = useQuery({ queryKey: chessKeys.repertoires, queryFn: repertoiresQuery });
  const [creating, setCreating] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-fg-strong">Your opening trees</h2>
        <Button size="sm" onClick={() => setCreating(true)} disabled={link.gamesCount === 0}>
          New tree
        </Button>
      </div>
      <QueryBoundary query={list} loadingLabel="Loading your trees…">
        {({ repertoires }) =>
          repertoires.length === 0 ? (
            <EmptyState
              title="No trees yet"
              description={
                link.gamesCount === 0
                  ? "Import your games first — trees are built from them."
                  : "Pick a colour and your first moves; the trainer builds the rest from your games."
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {repertoires.map((r) => (
                <SelectableCard
                  key={r.id}
                  tone={r.color === "w" ? "sky" : "accent"}
                  icon={<PlayIcon className="h-5 w-5" />}
                  title={r.name}
                  description={
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS_TEXT[r.status].tone} size="xs">
                        {STATUS_TEXT[r.status].label}
                      </Badge>
                      <span>{r.color === "w" ? "White" : "Black"}</span>
                      {r.stats && (
                        <span>
                          {r.stats.games.toLocaleString()} games · {r.stats.avgFollowPlies} plies in
                          the tree on average
                        </span>
                      )}
                    </span>
                  }
                  onClick={() => navigate(`${TRAINER_BASE}/${r.id}`)}
                />
              ))}
            </div>
          )
        }
      </QueryBoundary>
      {creating && <NewTreeModal link={link} onClose={() => setCreating(false)} />}
    </section>
  );
}

function NewTreeModal({ link, onClose }: { link: LichessLink; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const defaults = TreeSettingsSchema.parse({});
  const [color, setColor] = useState<"w" | "b">(link.byColor.w >= link.byColor.b ? "w" : "b");
  const [name, setName] = useState("");
  const [handpick, setHandpick] = useState(defaults.handpickMoves);
  const [depth, setDepth] = useState(defaults.engineDepth);
  const [deep, setDeep] = useState(true);
  const create = useMutation({
    mutationFn: () =>
      createRepertoire({
        name: name.trim() || (color === "w" ? "My White repertoire" : "My Black repertoire"),
        color,
        settings: {
          ...defaults,
          handpickMoves: handpick,
          engineDepth: depth,
          evalSpec: deep ? "BEST_MOVE_V1" : null,
        },
      }),
    onSuccess: (rep) => {
      void queryClient.invalidateQueries({ queryKey: chessKeys.repertoires });
      queryClient.setQueryData(chessKeys.repertoire(rep.id), rep);
      navigate(`${TRAINER_BASE}/${rep.id}`);
    },
  });

  return (
    <Modal onClose={onClose} title="New opening tree" size="md">
      <ModalBody className="flex flex-col gap-5">
        <SegmentedControl
          options={[
            { value: "w", label: `White (${link.byColor.w.toLocaleString()} games)` },
            { value: "b", label: `Black (${link.byColor.b.toLocaleString()} games)` },
          ]}
          value={color}
          onChange={setColor}
          fullWidth
        />
        <Input
          aria-label="Name"
          placeholder={color === "w" ? "My White repertoire" : "My Black repertoire"}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
        <Stepper
          label="Moves you choose yourself"
          caption="Your first moves are yours to pick (or leave to the engine); later ones are the engine's best."
          value={handpick}
          min={0}
          max={20}
          onChange={setHandpick}
        />
        <SegmentedControl
          options={[
            { value: "deep", label: "Deep analysis" },
            { value: "quick", label: "Quick, in this browser" },
          ]}
          value={deep ? "deep" : "quick"}
          onChange={(v) => setDeep(v === "deep")}
          fullWidth
        />
        {deep ? (
          <p className="text-sm text-fg-secondary">
            Every engine move comes from the analysis farm: the newest Stockfish searched to depth
            38–50 (deeper where more of your games go), Leela breaking near-ties, lichess's and
            ChessDB's existing deep analysis reused. The tree fills in as the farm works — hours for
            a big tree.
          </p>
        ) : (
          <Stepper
            label="Engine depth"
            caption="Stockfish in this browser. Deeper is stronger and slower."
            value={depth}
            min={8}
            max={30}
            onChange={setDepth}
          />
        )}
        {create.isError && <ErrorAlert message="Couldn't create the tree. Try again." />}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={create.isPending} onClick={() => create.mutate()}>
          Create
        </Button>
      </ModalFooter>
    </Modal>
  );
}
