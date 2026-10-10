import { parseSgf, SgfError } from "@boardgames/core/games/go/sgf";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  EmptyState,
  ErrorAlert,
  PageHeader,
  PageMain,
  Surface,
} from "../../../components/ui";
import { useCreateReview, useOwnReview, useOwnReviews } from "../api";
import ReviewBoard, { type ReviewGame } from "../components/ReviewBoard";

const STATUS_LABEL = {
  queued: "Waiting",
  running: "Reviewing",
  done: "Ready",
  failed: "Failed",
  unavailable: "Unavailable",
} as const;

/** `/go/review` — import an SGF for KataGo to review; `/go/review/:id` — one review. */
export default function ReviewPage() {
  const { "*": rest } = useParams();
  const id = Number.parseInt(rest ?? "", 10);
  return (
    <PageMain>
      <PageHeader title="Go game reviews" />
      {Number.isFinite(id) && id > 0 ? <OneReview id={id} /> : <ImportAndList />}
    </PageMain>
  );
}

function ImportAndList() {
  const navigate = useNavigate();
  const create = useCreateReview();
  const list = useOwnReviews();
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    try {
      parseSgf(text);
    } catch (err) {
      setError(err instanceof SgfError ? err.message : "That file isn't a Go record we can read");
      return;
    }
    create.mutate(
      { sgf: text },
      {
        onSuccess: ({ id }) => navigate(`/go/review/${id}`),
        onError: (err) =>
          setError(err instanceof Error ? err.message : "Could not start the review"),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Surface variant="raised" padding="md" className="flex flex-col gap-2">
        <p className="text-sm text-fg-secondary">
          Import a game record (.sgf, up to 19×19) and KataGo will review every move. Your online Go
          matches are reviewed automatically — open them from the game's match history.
        </p>
        {/* biome-ignore lint/correctness/noRestrictedElements: an sr-only file input behind a Button */}
        <input
          ref={fileInput}
          type="file"
          accept=".sgf,application/x-go-sgf"
          className="sr-only"
          onChange={onFile}
          aria-label="SGF file"
        />
        <Button
          size="sm"
          variant="primary"
          className="self-start"
          disabled={create.isPending}
          onClick={() => fileInput.current?.click()}
        >
          {create.isPending ? "Uploading…" : "Import SGF"}
        </Button>
        {error && <ErrorAlert message={error} />}
      </Surface>
      {list.data && list.data.length > 0 ? (
        <Surface variant="raised" padding="sm" className="flex flex-col divide-y divide-line">
          {list.data.map((r) => (
            <Link
              key={r.id}
              to={`/go/review/${r.id}`}
              className="flex items-center justify-between gap-2 px-2 py-2 text-sm"
            >
              <span className="text-fg-primary">{r.summary}</span>
              <span className="text-xs text-fg-muted">{STATUS_LABEL[r.status]}</span>
            </Link>
          ))}
        </Surface>
      ) : (
        list.isSuccess && <EmptyState title="No imported games yet" />
      )}
    </div>
  );
}

function OneReview({ id }: { id: number }) {
  const review = useOwnReview(id);
  const game = useMemo<ReviewGame | null>(() => {
    if (!review.data?.sgf) return null;
    try {
      const p = parseSgf(review.data.sgf);
      return { size: p.size, komi: p.komi, handicap: p.handicap, moves: p.moves };
    } catch {
      return null;
    }
  }, [review.data?.sgf]);
  if (review.isError) return <EmptyState title="Review not found" />;
  if (!game) return null;
  return (
    <div className="flex flex-col gap-3">
      <Button size="sm" variant="ghost" className="self-start" onClick={() => history.back()}>
        ← All reviews
      </Button>
      <ReviewBoard game={game} review={review.data} reviewLoading={review.isLoading} />
    </div>
  );
}
