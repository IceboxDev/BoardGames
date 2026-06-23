import { AVATAR_STYLES, type AvatarStyleId } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useEffect, useId, useMemo, useState } from "react";
import { games } from "../../games/registry.ts";
import { ApiError, SchemaError } from "../../lib/api-fetch.ts";
import { fileToDownscaledDataUri } from "../../lib/downscale-image.ts";
import { fetchAvatarJob, generateAvatar, saveAvatar } from "../../lib/profile.ts";
import { qk } from "../../lib/query-keys.ts";
import { CameraIcon, SearchIcon } from "../icons";
import { Button } from "../ui/Button.tsx";
import { Chip } from "../ui/Chip.tsx";
import { Field } from "../ui/Field.tsx";
import { Input } from "../ui/Input.tsx";
import { LoadingState } from "../ui/LoadingState.tsx";
import { Modal } from "../ui/Modal.tsx";
import { Textarea } from "../ui/Textarea.tsx";

// AI profile-picture generator. Flow: upload reference photo → pick game →
// pick style → optional comments → Generate starts a background job on the
// server (takes ~a minute) which the client polls → preview the result → save
// on confirm (or Regenerate returns here to tweak). The server owns the prompt;
// the client just collects inputs and previews/saves the webp it returns.

const COMMENTS_MAX = 500;
const GAME_LIST_LIMIT = 60;

type Phase = "form" | "generating" | "preview";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError || err instanceof SchemaError) return err.message;
  return "Something went wrong. Please try again.";
}

type GenerateAvatarModalProps = {
  userId: string;
  /** Set when generating for someone else (admin) — shown in the header. */
  targetName?: string;
  onClose: () => void;
};

export function GenerateAvatarModal({ userId, targetName, onClose }: GenerateAvatarModalProps) {
  const queryClient = useQueryClient();
  const commentsId = useId();

  const [phase, setPhase] = useState<Phase>("form");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [gameSlug, setGameSlug] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<AvatarStyleId>("standard");
  const [comments, setComments] = useState("");
  const [gameSearch, setGameSearch] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredGames = useMemo(() => {
    const q = gameSearch.trim().toLowerCase();
    const list = q ? games.filter((g) => g.title.toLowerCase().includes(q)) : games;
    return list.slice(0, GAME_LIST_LIMIT);
  }, [gameSearch]);

  const selectedGame = useMemo(() => games.find((g) => g.slug === gameSlug), [gameSlug]);

  const [jobId, setJobId] = useState<string | null>(null);

  const startMutation = useMutation({
    mutationFn: () =>
      generateAvatar(userId, {
        referenceImage: referenceImage as string,
        gameSlug: gameSlug as string,
        styleId,
        comments: comments.trim() || null,
      }),
    onMutate: () => {
      setError(null);
      setPhase("generating");
    },
    onSuccess: (res) => setJobId(res.jobId),
    onError: (err) => {
      setError(errorMessage(err));
      setPhase("form");
    },
  });

  // Poll the background job while generating; the effect below transitions the
  // modal when it finishes. Polling stops on done/error (and on unmount, since
  // react-query tears the query down).
  const jobQuery = useQuery({
    queryKey: ["avatar-job", userId, jobId],
    queryFn: ({ signal }) => fetchAvatarJob(userId, jobId as string, signal),
    enabled: !!jobId && phase === "generating",
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 2500 : false),
    retry: 2,
  });

  useEffect(() => {
    if (phase !== "generating") return;
    const data = jobQuery.data;
    if (data?.status === "done" && data.image) {
      setGenerated(data.image);
      setPhase("preview");
      setJobId(null);
    } else if (data?.status === "error") {
      setError(data.error ?? "Generation failed. Please try again.");
      setPhase("form");
      setJobId(null);
    } else if (jobQuery.isError) {
      setError(errorMessage(jobQuery.error));
      setPhase("form");
      setJobId(null);
    }
  }, [phase, jobQuery.data, jobQuery.isError, jobQuery.error]);

  const saveMutation = useMutation({
    mutationFn: (image: string) => saveAvatar(userId, image),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.profile(userId) });
      queryClient.invalidateQueries({ queryKey: qk.players() });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      setReferenceImage(await fileToDownscaledDataUri(file));
    } catch {
      setError("Couldn't read that image — try a different file.");
    }
  }

  const canGenerate = !!referenceImage && !!gameSlug;
  const busy = phase === "generating" || saveMutation.isPending;

  return (
    <Modal
      onClose={onClose}
      eyebrow="AI avatar"
      title="Generate profile picture"
      subheader={targetName ? <p className="text-sm text-fg-muted">for {targetName}</p> : undefined}
      panelClassName="max-w-lg max-h-[90vh]"
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
    >
      {phase === "generating" ? (
        <div className="py-6">
          <LoadingState label="Generating your avatar… this can take up to a minute." />
        </div>
      ) : phase === "preview" && generated ? (
        <div className="flex flex-col items-center gap-4">
          <img
            src={generated}
            alt="Generated avatar preview"
            className="h-44 w-44 rounded-full object-cover ring-2 ring-accent-400/50"
          />
          <p className="text-center text-sm text-fg-secondary">Use this as your profile picture?</p>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => saveMutation.mutate(generated)} loading={saveMutation.isPending}>
              Use this photo
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPhase("form")}
              disabled={saveMutation.isPending}
            >
              Regenerate
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex max-h-[68vh] flex-col gap-4 overflow-y-auto pr-1">
          {/* 1. Reference image */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-fg-secondary">
              Reference photo
            </span>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-white/15 bg-surface-900/60 p-3 transition hover:border-accent-400/40">
              <input type="file" accept="image/*" onChange={handleFile} className="sr-only" />
              {referenceImage ? (
                <img
                  src={referenceImage}
                  alt="Reference"
                  className="h-14 w-14 shrink-0 rounded-md object-cover"
                />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-surface-800 text-fg-muted">
                  <CameraIcon />
                </span>
              )}
              <span className="text-sm text-fg-secondary">
                {referenceImage ? "Change photo" : "Upload a clear photo of your face"}
              </span>
            </label>
          </div>

          {/* 2. Game */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-fg-secondary">
              Game you're an expert in
            </span>
            {selectedGame ? (
              // Selected: collapse the picker to just the chosen game + a way to
              // re-pick. (Showing the search + list here duplicated the game 3×.)
              <div className="flex items-center gap-2.5 rounded-lg border border-accent-400/50 bg-accent-500/15 px-3 py-2.5">
                <img
                  src={selectedGame.thumbnail}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded object-cover"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-accent-100">
                  {selectedGame.title}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setGameSlug(null);
                    setGameSearch("");
                  }}
                >
                  Change
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted">
                    <SearchIcon />
                  </span>
                  <Input
                    value={gameSearch}
                    onChange={(e) => setGameSearch(e.target.value)}
                    placeholder="Search games…"
                    aria-label="Search games"
                    className="pl-9"
                  />
                </div>
                <ul className="max-h-44 overflow-y-auto rounded-lg border border-white/10 bg-surface-900/40">
                  {filteredGames.map((game) => (
                    <li key={game.slug}>
                      {/* biome-ignore lint/correctness/noRestrictedElements: row-select option in a custom list */}
                      <button
                        type="button"
                        onClick={() => {
                          setGameSlug(game.slug);
                          setGameSearch("");
                        }}
                        className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-fg-secondary transition hover:bg-white/5 hover:text-fg-primary active:scale-[0.99]"
                      >
                        <img
                          src={game.thumbnail}
                          alt=""
                          loading="lazy"
                          className="h-7 w-7 shrink-0 rounded object-cover"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">{game.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* 3. Style */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-fg-secondary">
              Style
            </span>
            <div className="flex flex-wrap gap-2">
              {AVATAR_STYLES.map((style) => (
                <Chip
                  key={style.id}
                  pressed={styleId === style.id}
                  onClick={() => setStyleId(style.id)}
                >
                  {style.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* 4. Comments */}
          <Field label="Additional comments" htmlFor={commentsId} hint="Optional">
            <Textarea
              id={commentsId}
              value={comments}
              rows={2}
              maxLength={COMMENTS_MAX}
              placeholder="e.g. wearing a red scarf, holding a coffee…"
              onChange={(e) => setComments(e.target.value)}
            />
          </Field>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => startMutation.mutate()} disabled={!canGenerate}>
              Generate
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
