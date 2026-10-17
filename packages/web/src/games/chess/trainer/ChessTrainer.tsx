/**
 * The chess opening trainer, at `/play/chess/solo/trainer`: one board screen
 * (`board/BoardScreen.tsx`) — your folders, the board, the move explorer.
 * Each colour has one tree, created and built from your imported games as
 * soon as there are any. `?side`, `?line` and `?ply` hold the position.
 *
 * lichess sends the browser back here with `?code&state` after sign-in; a
 * fresh connection pulls every game straight away.
 */

import { TreeSettingsSchema } from "@boardgames/core/games/chess/trainer/tree";
import type { LichessLink, Repertoire, RepertoireSummary } from "@boardgames/core/protocol";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { BoardFallback } from "../../../components/RouteFallback";
import { ErrorAlert, LoadingState } from "../../../components/ui";
import useDocumentTitle from "../../../hooks/useDocumentTitle";
import { ApiError } from "../../../lib/api-fetch";
import {
  chessKeys,
  createRepertoire,
  linkAccount,
  linkQuery,
  repertoireQuery,
  repertoiresQuery,
} from "./api";
import { BoardScreen } from "./board/BoardScreen";
import { finishLichessLogin, OAuthError } from "./lichess/oauth";
import { TRAINER_BASE } from "./paths";
import { useLichessImport } from "./useLichessImport";
import { useLichessToken } from "./useLichessToken";
import { type TreeBuild, useTreeBuild } from "./useTreeBuild";

type Color = "w" | "b";

export default function ChessTrainer() {
  return (
    <Routes>
      <Route index element={<TrainerScreen />} />
      {/* Old links to one tree open the board on its colour. */}
      <Route path=":id" element={<OldTreeLink />} />
    </Routes>
  );
}

function OldTreeLink() {
  const { id = "" } = useParams();
  const rep = useQuery({ queryKey: chessKeys.repertoire(id), queryFn: repertoireQuery(id) });
  if (rep.isPending) return <LoadingState label="Opening the trainer…" fillHeight />;
  return <Navigate to={`${TRAINER_BASE}?side=${rep.data?.color ?? "w"}`} replace />;
}

function TrainerScreen() {
  useDocumentTitle("Chess · Opening trainer");
  const link = useQuery({ queryKey: chessKeys.link, queryFn: linkQuery });
  const [token, refreshToken] = useLichessToken();
  const callback = useOAuthCallback(refreshToken);
  const importer = useLichessImport(token, refreshToken);
  const l = link.data?.link ?? null;
  const reps = useColourTrees(l);

  // A fresh connection pulls every game straight away.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!callback.justLinked || !l || !token || autoStarted.current) return;
    autoStarted.current = true;
    importer.start(l);
  }, [callback.justLinked, l, token, importer]);

  if (link.isPending || callback.busy) return <BoardFallback />;

  const notice = (
    <>
      {callback.error && <ErrorAlert title="Couldn't connect lichess" message={callback.error} />}
      {link.isError && <ErrorAlert message="Couldn't load your lichess connection." />}
      {reps.error && <ErrorAlert message={reps.error} />}
    </>
  );
  // One screen from the first frame: the trees arrive into it (swapping
  // components when they did remounted the whole board — a visible flash).
  return (
    <WithBuilds
      reps={reps}
      token={token}
      gamesKey={l ? `${l.gamesCount}-${l.newestGameAt ?? 0}` : "none"}
    >
      {(builds) => (
        <BoardScreen builds={builds} link={l} token={token} importer={importer} notice={notice} />
      )}
    </WithBuilds>
  );
}

function WithBuilds({
  reps,
  token,
  gamesKey,
  children,
}: {
  reps: Record<Color, Repertoire | null>;
  token: string | null;
  gamesKey: string;
  children: (builds: Record<Color, TreeBuild | null>) => ReactNode;
}) {
  const w = useTreeBuild(reps.w, token, gamesKey, "w");
  const b = useTreeBuild(reps.b, token, gamesKey, "b");
  return children({ w: reps.w ? w : null, b: reps.b ? b : null });
}

/**
 * Your tree for each colour: the first one you have, else a new one made as
 * soon as you have imported games (built from them with the engine's best
 * wherever it's your move — you change moves on the board).
 */
function useColourTrees(link: LichessLink | null): {
  w: Repertoire | null;
  b: Repertoire | null;
  error: string | null;
} {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: chessKeys.repertoires,
    queryFn: repertoiresQuery,
    enabled: link !== null,
  });
  const pick = (c: Color): RepertoireSummary | undefined =>
    list.data?.repertoires
      .filter((r) => r.color === c)
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
  const idW = pick("w")?.id;
  const idB = pick("b")?.id;
  const w = useQuery({
    queryKey: chessKeys.repertoire(idW ?? ""),
    queryFn: repertoireQuery(idW ?? ""),
    enabled: !!idW,
  });
  const b = useQuery({
    queryKey: chessKeys.repertoire(idB ?? ""),
    queryFn: repertoireQuery(idB ?? ""),
    enabled: !!idB,
  });
  const [error, setError] = useState<string | null>(null);
  const creating = useRef<Record<Color, boolean>>({ w: false, b: false });

  useEffect(() => {
    if (!link || link.gamesCount === 0 || !list.data) return;
    for (const c of ["w", "b"] as const) {
      if (list.data.repertoires.some((r) => r.color === c) || creating.current[c]) continue;
      if (link.byColor[c] === 0) continue;
      creating.current[c] = true;
      createRepertoire({
        name: c === "w" ? "White" : "Black",
        color: c,
        settings: TreeSettingsSchema.parse({}),
      })
        .then((rep) => {
          queryClient.setQueryData(chessKeys.repertoire(rep.id), rep);
          return queryClient.invalidateQueries({ queryKey: chessKeys.repertoires });
        })
        .catch(() => {
          creating.current[c] = false;
          setError("Couldn't create your opening tree. Reload to try again.");
        });
    }
  }, [link, list.data, queryClient]);

  return {
    w: w.data ?? null,
    b: b.data ?? null,
    error: error ?? (list.isError || w.isError || b.isError ? "Couldn't load your trees." : null),
  };
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
