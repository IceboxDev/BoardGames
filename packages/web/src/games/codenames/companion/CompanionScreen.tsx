import { SCAN_IMAGE_MAX, type ScanCover } from "@boardgames/core/protocol";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { GameActionBar, GameScreen } from "../../../components/game-layout";
import { CameraIcon, EditIcon, GalleryIcon, RedoIcon, StarIcon } from "../../../components/icons";
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  ErrorAlert,
  IconButton,
  Input,
  Spinner,
  useConfirm,
} from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { downscaleImageFile } from "../../../lib/downscale-image";
import { errorMessageOf } from "../../../lib/error-message";
import { TEAM_BG, TEAM_TEXT, teamName } from "../logic/labels";
import { ScorePill, TableHeader, WordGrid } from "../table";
import { useScanGrid } from "./api";
import { type Board, cardAt, companionGridCards, teamCounts, unsureCount } from "./companion-state";
import { useCompanionBoard } from "./useCompanionBoard";

// The Codenames Companion: for a player sitting too far from the cards to
// read them. They photograph the grid, a vision model reads the 25 words
// (English or German), and the grid lives on their phone: tap a word to say
// what covered it at the table, hold it to ★ it, fix a misread word, turn the
// grid round. Nothing leaves the phone after the scan.

/** Photos go up as JPEG this size; a busy photo steps down until it fits the server's cap. */
const PHOTO_LADDER = [
  { maxEdge: 2048, quality: 0.85 },
  { maxEdge: 1600, quality: 0.75 },
  { maxEdge: 1280, quality: 0.7 },
] as const;

async function photoDataUri(file: File): Promise<string> {
  for (const step of PHOTO_LADDER) {
    const { dataUri } = await downscaleImageFile(file, { ...step, mimeType: "image/jpeg" });
    if (dataUri.length <= SCAN_IMAGE_MAX) return dataUri;
  }
  throw new Error("That photo is too large — try a smaller one.");
}

const COVER_BUTTONS: { cover: ScanCover; label: string; dot: string }[] = [
  { cover: "red", label: "Red", dot: "bg-cn-red" },
  { cover: "blue", label: "Blue", dot: "bg-cn-blue" },
  { cover: "bystander", label: "Bystander", dot: "bg-cn-tan" },
];

/** The two ways to bring a photo in: the camera, or one already taken. */
function PhotoButtons({ onFile }: { onFile: (file: File) => void }) {
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onFile(file);
  };
  const label =
    "inline-flex cursor-pointer items-center gap-2 rounded-ui-lg px-4 py-2 text-sm font-semibold focus-within:ring-2 focus-within:ring-accent-400/60";
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <label className={cn(label, "bg-accent-500 text-on-accent")}>
        <CameraIcon className="h-4 w-4" />
        Take a photo
        {/* biome-ignore lint/correctness/noRestrictedElements: sr-only file input inside its styled label */}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={pick}
        />
      </label>
      <label className={cn(label, "border border-line bg-fill text-fg-primary")}>
        <GalleryIcon className="h-4 w-4" />
        Choose a photo
        {/* biome-ignore lint/correctness/noRestrictedElements: sr-only file input inside its styled label */}
        <input type="file" accept="image/*" className="sr-only" onChange={pick} />
      </label>
    </div>
  );
}

export default function CompanionScreen() {
  const [board, dispatch] = useCompanionBoard();
  const scan = useScanGrid();
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const read = async (file: File) => {
    setError(null);
    try {
      const image = await photoDataUri(file);
      setPreview(image);
      const result = await scan.mutateAsync({ image });
      dispatch({ type: "scanned", scan: result });
    } catch (err) {
      setError(errorMessageOf(err, "The photo couldn't be read — try another one."));
    } finally {
      setPreview(null);
    }
  };

  const newGrid = async () => {
    const ok = await confirm({
      title: "Start a new grid?",
      description: "This board — its covers and marks — is cleared from this phone.",
      confirmLabel: "New grid",
    });
    if (ok) dispatch({ type: "reset" });
  };

  if (board === null || scan.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 p-4">
        {scan.isPending ? (
          <div className="flex flex-col items-center gap-3 text-sm text-fg-secondary">
            {preview && (
              <img
                src={preview}
                alt="The grid being read"
                className="max-h-64 rounded-card-lg object-contain opacity-70"
              />
            )}
            <span className="flex items-center gap-2">
              <Spinner /> Reading the words…
            </span>
          </div>
        ) : (
          <EmptyState
            icon={<CameraIcon className="h-6 w-6" />}
            title="Photograph the grid"
            description="Too far from the cards to read them? Take a photo of all 25 words — English or German — and read them here. Then tap a word to cover it as the table does."
            action={<PhotoButtons onFile={read} />}
          />
        )}
        {error && <ErrorAlert message={error} />}
      </div>
    );
  }

  return (
    <>
      <CompanionBoard board={board} dispatch={dispatch} onNewGrid={newGrid} />
      {confirmDialog}
    </>
  );
}

function CompanionBoard({
  board,
  dispatch,
  onNewGrid,
}: {
  board: Board;
  dispatch: ReturnType<typeof useCompanionBoard>[1];
  /** Back to the photo screen (after a confirm). */
  onNewGrid: () => void;
}) {
  // The card (not screen position) the action bar acts on.
  const [selected, setSelected] = useState<number | null>(null);
  const [fixing, setFixing] = useState(false);
  const [draft, setDraft] = useState("");
  const cell = selected === null ? null : board.cells[selected];
  const cover = selected === null ? null : (board.covers[selected] ?? null);
  const unsure = unsureCount(board);

  // A new board (rescan, new grid) starts with nothing selected.
  const words = board.cells.map((c) => c.word).join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on a new grid only
  useEffect(() => {
    setSelected(null);
    setFixing(false);
  }, [words]);

  const select = (position: number) => {
    const card = cardAt(board, position);
    setFixing(false);
    setSelected((s) => (s === card ? null : card));
  };

  const setCover = (next: ScanCover | null) => {
    if (selected === null) return;
    dispatch({ type: "cover", card: selected, cover: next });
    setSelected(null);
  };

  const startFix = () => {
    if (cell === null || cell === undefined) return;
    setDraft(cell.word);
    setFixing(true);
  };

  const saveFix = (e: FormEvent) => {
    e.preventDefault();
    if (selected === null) return;
    dispatch({ type: "fixWord", card: selected, word: draft });
    setFixing(false);
    setSelected(null);
  };

  const starterLabel =
    board.starter === null ? "Who went first?" : `${teamName(board.starter)} went first`;

  const center = fixing ? (
    <form onSubmit={saveFix} className="flex w-full max-w-xs items-center gap-2">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label="The word as printed"
        maxLength={40}
        autoFocus
        className="min-w-0 flex-1 uppercase"
      />
      <Button type="submit" size="sm" variant="primary" disabled={draft.trim() === ""}>
        Save
      </Button>
    </form>
  ) : cell ? (
    <span className="truncate text-xl font-black uppercase tracking-pill text-fg-strong">
      {cell.word || "Hidden word"}
    </span>
  ) : (
    <span className="truncate text-xs text-fg-secondary">
      {unsure > 0
        ? `${unsure} ${unsure === 1 ? "word" : "words"} may be misread — tap one to fix it`
        : "Tap a word to cover it · hold to ★ it"}
    </span>
  );

  return (
    <GameScreen
      background="bg-surface-950"
      contentClassName="mx-auto w-full max-w-6xl"
      actionBar={
        <GameActionBar>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {COVER_BUTTONS.map((b) => (
              <Button
                key={b.cover}
                size="sm"
                variant={cover === b.cover ? "primary" : "secondary"}
                disabled={selected === null}
                onClick={() => setCover(b.cover)}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full", b.dot)} aria-hidden />
                {b.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="secondary"
              disabled={selected === null || cover === null}
              onClick={() => setCover(null)}
            >
              Clear
            </Button>
            <IconButton
              size="sm"
              variant="bordered"
              icon={<StarIcon />}
              aria-label="Mark this word"
              title="Mark it — your own shortlist (or hold a word)"
              pressed={selected !== null && board.marks[selected] === true}
              disabled={selected === null}
              onClick={() => selected !== null && dispatch({ type: "mark", card: selected })}
            />
            <IconButton
              size="sm"
              variant="bordered"
              icon={<EditIcon />}
              aria-label="Fix this word"
              title="Fix a misread word"
              disabled={selected === null}
              onClick={startFix}
            />
          </div>
        </GameActionBar>
      }
    >
      <TableHeader
        status={
          <div className="flex min-w-0 items-center gap-1.5">
            {teamCounts(board).map((t) => (
              <ScorePill
                key={t.team}
                dotClass={TEAM_BG[t.team]}
                label={teamName(t.team)}
                labelClass={TEAM_TEXT[t.team]}
                value={t.left ?? t.covered}
                active={board.starter === t.team}
                title={
                  t.left === null
                    ? `${teamName(t.team)}: ${t.covered} covered`
                    : `${teamName(t.team)}: ${t.left} still to find`
                }
              />
            ))}
          </div>
        }
        center={center}
        controls={
          <>
            {board.language && (
              <Badge tone="neutral" shape="pill" className="hidden sm:inline-flex">
                {board.language === "de" ? "Deutsch" : "English"}
              </Badge>
            )}
            <Chip
              size="xs"
              pressed={board.starter !== null}
              title="The team that went first has 9 agents, the other 8"
              onClick={() =>
                dispatch({
                  type: "setStarter",
                  starter: board.starter === null ? 0 : board.starter === 0 ? 1 : null,
                })
              }
            >
              {starterLabel}
            </Chip>
            <IconButton
              size="sm"
              variant="bordered"
              icon={<RedoIcon />}
              aria-label="Turn the grid round"
              title="Turn the grid round — for a photo taken from the other side"
              pressed={board.rotated}
              onClick={() => dispatch({ type: "rotate" })}
            />
            <IconButton
              size="sm"
              variant="bordered"
              icon={<CameraIcon />}
              aria-label="New grid"
              title="New grid"
              onClick={onNewGrid}
            />
          </>
        }
      />
      <WordGrid
        cards={companionGridCards(board, selected)}
        onPick={select}
        onHold={(position) => dispatch({ type: "mark", card: cardAt(board, position) })}
      />
    </GameScreen>
  );
}
