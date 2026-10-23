/**
 * The trainer's front page, led by a position: the folder to study next as a
 * board, with its name, its moves and one action; then the order the trainer
 * would take the rest in ("Coming up"), and every opening as a shelf of board
 * thumbnails. A folder is always studied whole, so nothing here counts moves
 * to do: a folder is due, updated, new, resting, being analysed or waiting
 * (`home-plan.ts`). Picking a thumbnail puts that folder in the hero; its
 * action starts a session of the whole folder.
 */
import { learnable } from "@boardgames/core/games/chess/trainer/drill";
import type { ChessDrillOverview, EvalQueueResponse } from "@boardgames/core/protocol";
import { useMemo, useRef, useState } from "react";
import {
  Badge,
  type BadgeTone,
  Button,
  Eyebrow,
  type EyebrowTone,
} from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { MiniBoard } from "../../components/board/MiniBoard";
import type { Placed } from "./folder-tree";
import {
  aboutTime,
  displayName,
  etaSeconds,
  type FolderState,
  type HomeFolder,
  lineOf,
  placeOf,
  settled,
  shelves,
  stateOf,
  suggestions,
} from "./home-plan";
import { KnowledgeBar } from "./KnowledgeBar";
import type { FarmPosition } from "./useFolderLearning";

export type { HomeFolder } from "./home-plan";

interface Props {
  readonly color: "w" | "b";
  readonly folders: readonly HomeFolder[];
  readonly overview: ChessDrillOverview | null;
  /** Study the folder whole. */
  readonly onDrill: (folderId: string) => void;
  readonly onShowMap: (placed: Placed) => void;
  readonly onShowBoard: (placed: Placed) => void;
  /** The positions each folder waits on the farm for (`useFolderLearning`). */
  readonly waitingIn?: ReadonlyMap<string, readonly FarmPosition[]>;
  /** Where those stand in the farm's queue (`useFarmQueue`), when known. */
  readonly farmQueue?: EvalQueueResponse | null;
  /**
   * The tree or your schedule hasn't arrived yet: a placeholder in the page's
   * own shape, never "nothing to study" (or every folder counted as new).
   */
  readonly loading?: boolean;
}

/** How many folders "Coming up" shows. */
const QUEUE = 12;

const STATE: Record<
  FolderState,
  { label: string; tone: BadgeTone; eyebrow: string; eyebrowTone: EyebrowTone }
> = {
  due: { label: "Due", tone: "amber", eyebrow: "Due now", eyebrowTone: "amber" },
  updated: { label: "Updated", tone: "accent", eyebrow: "Updated", eyebrowTone: "accent" },
  new: { label: "New", tone: "emerald", eyebrow: "Up next", eyebrowTone: "accent" },
  resting: { label: "Learnt", tone: "neutral", eyebrow: "Studied", eyebrowTone: "neutral" },
  analysing: { label: "Analysing", tone: "sky", eyebrow: "Being analysed", eyebrowTone: "sky" },
  waiting: { label: "Waits", tone: "neutral", eyebrow: "Not reached yet", eyebrowTone: "neutral" },
};

function says(state: FolderState, stillGrowing: boolean): string {
  const growing = stillGrowing ? " The farm is still adding to it." : "";
  switch (state) {
    case "due":
      return "Moves of yours here are due. The folder comes back whole, its lines shuffled together, so you learn to tell them apart.";
    case "updated":
      return `New moves of yours have landed here since you studied it. You go through the whole folder again, the new moves taught first.${growing}`;
    case "new":
      return `You haven't studied this folder yet. Each move of yours here is shown once, then asked back, the whole folder shuffled.${growing}`;
    case "resting":
      return "Studied, and nothing here is due yet. It comes back on its own; you can practise it any time.";
    case "analysing":
      return "The farm is still analysing this folder. It becomes something to study once its first moves are settled.";
    case "waiting":
      return "Nothing here is analysed yet: it waits for your move higher up the line, or for the farm.";
  }
}

const ACTION: Record<FolderState, string | null> = {
  due: "Review the folder",
  updated: "Study the updated folder",
  new: "Learn the folder",
  resting: "Practise the folder",
  analysing: null,
  waiting: null,
};

export function TrainerHome({
  color,
  folders,
  overview,
  onDrill,
  onShowMap,
  onShowBoard,
  waitingIn,
  farmQueue = null,
  loading = false,
}: Props) {
  const ranked = useMemo(() => suggestions(folders), [folders]);
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = folders.find((f) => f.placed.folder.id === picked) ?? null;
  const hero = chosen ?? ranked[0] ?? null;
  const queue = ranked.filter((f) => f !== hero).slice(0, QUEUE);
  const shelfList = useMemo(
    () =>
      shelves(
        folders.filter((f) => learnable(f.l) > 0 || f.l.pending > 0),
        color === "w" ? "Other replies" : "Other first moves",
      ),
    [folders, color],
  );
  const waiting = folders.filter((f) => stateOf(f.l) === "waiting").length;
  const analysing = folders.filter((f) => stateOf(f.l) === "analysing").length;
  const top = useRef<HTMLDivElement>(null);
  const pick = (f: HomeFolder) => {
    setPicked(f.placed.folder.id);
    top.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  if (loading) return <HomeSkeleton />;

  return (
    <div className="@container min-h-0 flex-1 overflow-y-auto">
      <div ref={top} className="mx-auto flex max-w-6xl flex-col gap-8 px-2 py-4">
        {hero ? (
          <Hero
            f={hero}
            color={color}
            picked={chosen !== null && chosen !== ranked[0]}
            onBack={() => setPicked(null)}
            overview={overview}
            onDrill={onDrill}
            onShowMap={onShowMap}
            onShowBoard={onShowBoard}
          />
        ) : (
          <NothingYet color={color} analysing={analysing} waiting={waiting} />
        )}

        {queue.length > 0 && (
          <ShelfRow
            title="Coming up"
            note="in the order the trainer would take them"
            folders={queue}
            color={color}
            current={hero}
            onPick={pick}
          />
        )}

        {shelfList.map((s) => (
          <ShelfRow
            key={s.id}
            title={s.name}
            note={`${s.folders.length} ${s.folders.length === 1 ? "folder" : "folders"}`}
            folders={s.folders}
            color={color}
            current={hero}
            onPick={pick}
          />
        ))}

        <BackFromFarm folders={folders} waitingIn={waitingIn} farmQueue={farmQueue} />
      </div>
      {hero && ACTION[stateOf(hero.l)] && (
        <div className="@3xl:hidden sticky bottom-0 flex gap-2 bg-linear-to-t from-surface-950 via-surface-950/90 to-transparent px-2 pt-6 pb-3">
          <Button variant="primary" block onClick={() => onDrill(hero.placed.folder.id)}>
            {ACTION[stateOf(hero.l)]}
          </Button>
        </div>
      )}
    </div>
  );
}

function Hero({
  f,
  color,
  picked,
  onBack,
  overview,
  onDrill,
  onShowMap,
  onShowBoard,
}: {
  f: HomeFolder;
  color: "w" | "b";
  /** Shown because you picked it, not because it's next. */
  picked: boolean;
  onBack: () => void;
  overview: ChessDrillOverview | null;
  onDrill: Props["onDrill"];
  onShowMap: Props["onShowMap"];
  onShowBoard: Props["onShowBoard"];
}) {
  const state = stateOf(f.l);
  const look = STATE[state];
  const action = ACTION[state];
  const name = displayName(f.placed);
  const lastMove = f.placed.folder.moves.at(-1) ?? null;
  return (
    <section
      aria-label={`${picked ? "Selected" : "Next"}: ${name}`}
      className="grid items-center gap-6 @3xl:grid-cols-[minmax(0,24rem)_1fr] @3xl:gap-10"
    >
      {/* biome-ignore lint/correctness/noRestrictedElements: the position itself is the control (it opens the board), a surface the UI kit has no shape for. */}
      <button
        type="button"
        onClick={() => onShowBoard(f.placed)}
        title="Show on the board"
        className="w-full max-w-sm cursor-pointer rounded-card-md shadow-lg ring-1 ring-line transition hover:ring-accent-400/60"
      >
        <MiniBoard
          fen={f.placed.fen}
          orientation={color}
          lastMove={lastMove}
          label={`${name}: the position after ${lineOf(f.placed)}`}
        />
      </button>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex items-center gap-3">
          <Eyebrow tone={picked ? "neutral" : look.eyebrowTone}>
            {picked ? `Selected · ${look.label}` : look.eyebrow}
          </Eyebrow>
          {picked && (
            <Button variant="ghost" size="xs" onClick={onBack}>
              Back to the suggestion
            </Button>
          )}
        </div>
        <h1 className="m-0 text-balance font-extrabold text-4xl text-fg-strong leading-none tracking-tight @3xl:text-5xl">
          {name}
        </h1>
        <span className="font-mono text-accent-300 text-sm">{lineOf(f.placed)}</span>
        <p className="m-0 max-w-prose text-fg-secondary">
          {says(state, !settled(f.l) && learnable(f.l) > 0)}
        </p>
        <KnowledgeBar l={f.l} className="h-1.5 max-w-sm" />
        <div className="flex flex-wrap gap-2">
          {action && (
            <Button
              variant="primary"
              className="hidden @3xl:inline-flex"
              onClick={() => onDrill(f.placed.folder.id)}
            >
              {action} →
            </Button>
          )}
          <Button variant="secondary" onClick={() => onShowBoard(f.placed)}>
            Show on the board
          </Button>
          <Button variant="ghost" onClick={() => onShowMap(f.placed)}>
            Find it on the map
          </Button>
        </div>
        {overview && <TodayLine overview={overview} />}
      </div>
    </section>
  );
}

/** How many folders the "back from the farm" line names. */
const BACK_NAMES = 3;

/**
 * Which folders the farm finishes next, and roughly when: each folder's wait is
 * its last waiting position's (`etaSeconds`), so the guess is a lower bound.
 */
function BackFromFarm({
  folders,
  waitingIn,
  farmQueue,
}: {
  folders: readonly HomeFolder[];
  waitingIn: Props["waitingIn"];
  farmQueue: EvalQueueResponse | null;
}) {
  const waitingFolders = folders.filter(
    (f) => (waitingIn?.get(f.placed.folder.id)?.length ?? 0) > 0,
  );
  if (waitingFolders.length === 0 || !farmQueue) return null;
  if (farmQueue.lanes === 0) {
    return (
      <p className="m-0 text-fg-muted text-sm">
        The analysis farm isn't running right now; {waitingFolders.length}{" "}
        {waitingFolders.length === 1 ? "folder waits" : "folders wait"} for it.
      </p>
    );
  }
  const next = waitingFolders
    .flatMap((f) => {
      const t = etaSeconds(
        waitingIn?.get(f.placed.folder.id) ?? [],
        farmQueue.places,
        farmQueue.lanes,
        farmQueue.avgSeconds,
      );
      return t === null ? [] : [{ f, t }];
    })
    .sort((a, b) => a.t - b.t)
    .slice(0, BACK_NAMES);
  const [first, ...then] = next;
  if (!first) return null;
  return (
    <p className="m-0 text-fg-secondary text-sm">
      Next back from the farm:{" "}
      <b className="font-semibold text-fg-strong">{displayName(first.f.placed)}</b>, in{" "}
      {aboutTime(first.t)}
      {then.length > 0 && (
        <>
          {". Then "}
          {then.map((x, i) => (
            <span key={x.f.placed.folder.id}>
              {i > 0 && (i === then.length - 1 ? " and " : ", ")}
              <b className="font-semibold text-fg-strong">{displayName(x.f.placed)}</b> (
              {aboutTime(x.t)})
            </span>
          ))}
        </>
      )}
      . <span className="text-fg-muted">At the earliest: the farm adds positions as it goes.</span>
    </p>
  );
}

/** The Home's shape while it loads: a board-sized hero and shelves of board thumbnails. */
function HomeSkeleton() {
  const block = "rounded-card-md bg-fill motion-safe:animate-pulse";
  return (
    <div className="@container min-h-0 flex-1 overflow-hidden" aria-busy="true">
      <span className="sr-only">Loading your folders…</span>
      <div aria-hidden="true" className="mx-auto flex max-w-6xl flex-col gap-8 px-2 py-4">
        <div className="grid items-center gap-6 @3xl:grid-cols-[minmax(0,24rem)_1fr] @3xl:gap-10">
          <div className={cn(block, "aspect-square w-full max-w-sm")} />
          <div className="flex flex-col gap-4">
            <div className={cn(block, "h-3 w-24")} />
            <div className={cn(block, "h-10 w-2/3")} />
            <div className={cn(block, "h-4 w-1/2")} />
            <div className={cn(block, "h-12 w-full max-w-prose")} />
            <div className="flex gap-2">
              <div className={cn(block, "h-9 w-40")} />
              <div className={cn(block, "h-9 w-36")} />
            </div>
          </div>
        </div>
        {[0, 1].map((row) => (
          <div key={row} className="flex flex-col gap-3">
            <div className={cn(block, "h-4 w-32")} />
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 8 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholders.
                <div key={i} className="flex w-32 shrink-0 flex-col gap-2 @3xl:w-40">
                  <div className={cn(block, "aspect-square w-full")} />
                  <div className={cn(block, "h-3 w-3/4")} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TodayLine({ overview: o }: { overview: ChessDrillOverview }) {
  const parts = [
    `${o.streak.current}-day streak`,
    o.retention30 !== null ? `${Math.round(o.retention30 * 100)}% kept` : null,
    o.today.reviews > 0 ? `${o.today.reviews} answers today` : null,
  ].filter((p): p is string => p !== null);
  return <p className="m-0 text-fg-muted text-xs">{parts.join(" · ")}</p>;
}

function NothingYet({
  color,
  analysing,
  waiting,
}: {
  color: "w" | "b";
  analysing: number;
  waiting: number;
}) {
  return (
    <section className="flex max-w-2xl flex-col gap-3 py-6">
      <Eyebrow tone="neutral">{color === "w" ? "♔ White" : "♚ Black"}</Eyebrow>
      <h1 className="m-0 text-balance font-extrabold text-3xl text-fg-strong tracking-tight">
        Nothing to study yet
      </h1>
      <p className="m-0 text-fg-secondary">
        {analysing > 0
          ? `The farm is analysing ${analysing} of your folders here. Each one appears as soon as its first moves are settled.`
          : waiting > 0
            ? `Your ${waiting} folders here wait for your moves, or for the farm to take them on.`
            : "Your folders appear here once your games are imported and the tree is built."}
      </p>
    </section>
  );
}

function ShelfRow({
  title,
  note,
  folders,
  color,
  current,
  onPick,
}: {
  title: string;
  note: string;
  folders: readonly HomeFolder[];
  color: "w" | "b";
  current: HomeFolder | null;
  onPick: (f: HomeFolder) => void;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 font-bold text-base text-fg-strong">{title}</h2>
        <span className="text-fg-muted text-xs">{note}</span>
      </div>
      <ul className="-mx-2 m-0 flex snap-x list-none gap-3 overflow-x-auto px-2 pt-1 pb-2">
        {folders.map((f) => (
          <li key={f.placed.folder.id} className="shrink-0 snap-start">
            <FolderCard f={f} color={color} current={f === current} onPick={onPick} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function FolderCard({
  f,
  color,
  current,
  onPick,
}: {
  f: HomeFolder;
  color: "w" | "b";
  current: boolean;
  onPick: (f: HomeFolder) => void;
}) {
  const state = stateOf(f.l);
  const name = displayName(f.placed);
  return (
    // biome-ignore lint/correctness/noRestrictedElements: a board thumbnail with its caption is one pickable surface, not a control shape the UI kit has.
    <button
      type="button"
      onClick={() => onPick(f)}
      aria-pressed={current}
      title={lineOf(f.placed)}
      className="group flex w-32 cursor-pointer flex-col gap-2 text-left @3xl:w-40"
    >
      <span
        className={cn(
          "block rounded-card-md ring-1 transition group-hover:-translate-y-0.5 group-hover:ring-accent-400/70",
          current ? "ring-2 ring-accent-400" : "ring-line",
        )}
      >
        <MiniBoard
          fen={f.placed.fen}
          orientation={color}
          lastMove={f.placed.folder.moves.at(-1) ?? null}
          label={`${name}: the position after ${lineOf(f.placed)}`}
        />
      </span>
      <span className="truncate font-semibold text-fg-strong text-sm">{name}</span>
      <span className="flex items-center gap-1.5">
        <Badge tone={STATE[state].tone} size="xs" ring={state === "waiting"}>
          {STATE[state].label}
        </Badge>
        {placeOf(f.placed) && (
          <span className="min-w-0 truncate text-2xs text-fg-muted">{placeOf(f.placed)}</span>
        )}
        {!settled(f.l) && learnable(f.l) > 0 && (
          <span className="text-2xs text-sky-300" title="The farm is still adding to this folder">
            ⟳
          </span>
        )}
      </span>
      <KnowledgeBar l={f.l} className="h-0.5" />
    </button>
  );
}
