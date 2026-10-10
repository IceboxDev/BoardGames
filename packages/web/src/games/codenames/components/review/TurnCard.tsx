import { formatClueCount } from "@boardgames/core/games/codenames/clue-rules";
import { useEffect, useRef } from "react";
import { BotIcon, KeyIcon, UsersIcon } from "../../../../components/icons";
import { cn } from "../../../../lib/cn";
import type { ReviewGuess, ReviewTarget, ReviewTurn, Verdict } from "../../logic/review";
import type { CoverTone } from "../WordGrid";

// One turn of the review, in its two halves. The spymaster's (tinted in the
// side's colour): the clue as a name plate, each word it was aimed at with
// its reason and what became of it, any leftover meant for the extra guess,
// and the idea in one sentence. Then the operatives' (a darker inset): how
// they read it and every touch with its confidence and reason. A footer says
// how the turn ended.

const DOT: Record<CoverTone, string> = {
  red: "bg-cn-red",
  blue: "bg-cn-blue",
  tan: "bg-cn-tan",
  ink: "bg-cn-ink ring-1 ring-fg-strong/40",
  green: "bg-cn-green",
};

const INK: Record<CoverTone, string> = {
  red: "text-cn-red",
  blue: "text-cn-blue",
  tan: "text-cn-tan",
  ink: "text-fg-strong",
  green: "text-cn-green",
};

const BAR: Record<CoverTone, string> = {
  red: "bg-cn-red",
  blue: "bg-cn-blue",
  tan: "bg-cn-tan",
  ink: "bg-fg-strong",
  green: "bg-cn-green",
};

const FATE: Record<ReviewTarget["fate"], { mark: string; label: string; ink: string }> = {
  now: { mark: "✓", label: "found this turn", ink: "text-emerald-300" },
  later: { mark: "↻", label: "found on a later turn", ink: "text-sky-300" },
  them: { mark: "⇄", label: "uncovered by the other side", ink: "text-amber-300" },
  never: { mark: "·", label: "never found", ink: "text-fg-muted" },
};

const VERDICT: Record<Verdict, { mark: string; ink: string; label: string }> = {
  hit: { mark: "✓", ink: "text-emerald-300", label: "agent" },
  bystander: { mark: "✗", ink: "text-fg-secondary", label: "bystander" },
  opponent: { mark: "✗", ink: "text-amber-300", label: "their agent" },
  assassin: { mark: "☠", ink: "text-rose-300", label: "assassin" },
};

function WordChip({
  word,
  tone,
  className,
}: {
  word: string;
  tone: CoverTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-ui-md bg-cn-plate/95 px-1.5 py-0.5 text-3xs font-black uppercase tracking-pill text-cn-card-ink",
        className,
      )}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[tone])} />
      {word}
    </span>
  );
}

function Confidence({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-1" title={`${Math.round(value * 100)}% sure`}>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-fill-strong">
        <span
          className="block h-full rounded-full bg-fg-secondary"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </span>
      <span className="w-7 text-right text-3xs tabular-nums text-fg-muted">
        {Math.round(value * 100)}%
      </span>
    </span>
  );
}

function TargetRow({ target }: { target: ReviewTarget }) {
  const fate = FATE[target.fate];
  return (
    <li className="grid grid-cols-[auto_1rem_minmax(0,1fr)] items-start gap-x-2">
      <WordChip word={target.word} tone={target.tone} />
      <span className={cn("pt-0.5 text-xs font-bold", fate.ink)} title={fate.label}>
        {fate.mark}
      </span>
      <span className="pt-0.5 text-3xs text-fg-secondary">
        {target.why ?? <span className="text-fg-muted">{fate.label}</span>}
      </span>
    </li>
  );
}

function GuessRow({ guess, n }: { guess: ReviewGuess; n: number }) {
  const v = VERDICT[guess.verdict];
  return (
    <li className="grid grid-cols-[1rem_auto_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-0.5">
      <span className="pt-0.5 text-3xs font-bold tabular-nums text-fg-muted">{n}</span>
      <WordChip word={guess.word} tone={guess.tone} />
      <span className={cn("pt-0.5 text-3xs font-semibold", v.ink)}>
        {v.mark} {v.label}
      </span>
      {guess.confidence !== null ? <Confidence value={guess.confidence} /> : <span />}
      {guess.why && (
        <span className="col-span-3 col-start-2 text-3xs italic text-fg-secondary">
          “{guess.why}”
        </span>
      )}
    </li>
  );
}

function Who({ name, ai }: { name: string; ai: string | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-3xs">
      {ai && <BotIcon className="h-3 w-3 shrink-0 text-fg-muted" />}
      <span className="truncate text-fg-secondary">{name}</span>
      {ai && <span className="shrink-0 text-fg-muted">· {ai}</span>}
    </span>
  );
}

const TINT: Record<CoverTone, string> = {
  red: "from-cn-red/15",
  blue: "from-cn-blue/15",
  tan: "from-cn-tan/15",
  ink: "from-fg-strong/10",
  green: "from-cn-green/15",
};

/** A half's heading: whose half it is, and who played it. */
function RoleHeading({
  icon,
  label,
  iconClass,
  who,
  ai,
}: {
  icon: React.ReactNode;
  label: string;
  iconClass: string;
  who: string | null;
  ai: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", iconClass)}
      >
        {icon}
      </span>
      <span className="text-3xs font-bold uppercase tracking-label text-fg-primary">{label}</span>
      {who && (
        <span className="ml-auto min-w-0">
          <Who name={who} ai={ai} />
        </span>
      )}
    </div>
  );
}

function SubLabel({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span className="text-3xs font-semibold uppercase tracking-label text-fg-muted" title={title}>
      {children}
    </span>
  );
}

function endTone(turn: ReviewTurn): string {
  const last = turn.guesses.at(-1)?.verdict;
  if (last === "assassin") return "bg-rose-500/10 text-rose-300";
  if (turn.end === "Found the last agent") return "bg-emerald-500/10 text-emerald-300";
  if (last === "bystander" || last === "opponent") return "bg-amber-500/10 text-amber-200";
  return "bg-fill text-fg-secondary";
}

export function TurnCard({
  turn,
  selected,
  onSelect,
}: {
  turn: ReviewTurn;
  selected: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);
  const operativesPlayed = turn.guesses.length > 0 || turn.unplayed.length > 0;

  return (
    <article
      ref={ref}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-card-lg border shadow-lg transition-colors",
        selected ? "border-line-strong ring-1 ring-fg-strong/20" : "border-line-soft",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 z-lift w-1", BAR[turn.tone])} />

      {/* biome-ignore lint/correctness/noRestrictedElements: the turn header is the select target */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "flex w-full items-center gap-2 border-b border-line-soft px-4 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-400/60",
          selected ? "bg-fill-strong" : "bg-fill-soft hover:bg-fill",
        )}
      >
        <span className="text-3xs font-semibold uppercase tracking-label text-fg-muted">
          Turn {turn.index + 1}
        </span>
        <span className={cn("text-3xs font-black uppercase tracking-label", INK[turn.tone])}>
          {turn.side}
        </span>
        {turn.standIn && (
          <span className="rounded-full bg-amber-500/15 px-1.5 text-3xs text-amber-300">
            stand-in
          </span>
        )}
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-3xs font-black tabular-nums",
            turn.hits > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-fill-strong text-fg-muted",
          )}
          title={`${turn.hits} agent${turn.hits === 1 ? "" : "s"} found this turn`}
        >
          +{turn.hits} found
        </span>
      </button>

      {/* The spymaster's half. */}
      <section
        className={cn(
          "flex flex-col gap-3 bg-gradient-to-br to-transparent px-4 pb-4 pt-3",
          TINT[turn.tone],
        )}
      >
        <RoleHeading
          icon={<KeyIcon className="h-3 w-3" />}
          label="Spymaster"
          iconClass={cn(BAR[turn.tone], "text-cn-cover-ink")}
          who={turn.giver}
          ai={turn.giverAi}
        />
        {turn.clue ? (
          <div className="flex items-stretch self-start overflow-hidden rounded-ui-md shadow-md ring-1 ring-cn-card-ink/20">
            <span className="flex items-center bg-cn-plate px-3 py-1 text-lg font-black uppercase tracking-pill text-cn-card-ink">
              {turn.clue.word}
            </span>
            <span
              className={cn(
                "flex min-w-9 items-center justify-center px-2 text-lg font-black tabular-nums text-cn-cover-ink",
                BAR[turn.tone],
              )}
            >
              {formatClueCount(turn.clue.count)}
            </span>
          </div>
        ) : (
          <span className="text-sm font-semibold text-fg-secondary">
            {turn.giver === null ? "Sudden death — no clue" : "No clue given"}
          </span>
        )}

        {turn.targets && turn.targets.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <SubLabel>Meant</SubLabel>
            <ul className="flex flex-col gap-1">
              {turn.targets.map((t) => (
                <TargetRow key={t.card} target={t} />
              ))}
            </ul>
          </div>
        )}

        {turn.leftover.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <SubLabel title="Words still owed from earlier clues, meant for the extra (+1) guess">
              Extra guess for
            </SubLabel>
            <ul className="flex flex-col gap-1">
              {turn.leftover.map((t) => (
                <TargetRow key={t.card} target={t} />
              ))}
            </ul>
          </div>
        )}

        {turn.reasoning && (
          <p className="rounded-ui-md bg-surface-950/40 px-3 py-2 text-xs italic leading-relaxed text-fg-primary">
            “{turn.reasoning}”
          </p>
        )}
      </section>

      {/* The operatives' half. */}
      {operativesPlayed && (
        <section className="flex flex-col gap-2.5 border-t border-line-soft bg-surface-950/55 px-4 pb-3 pt-3">
          <RoleHeading
            icon={<UsersIcon className="h-3 w-3" />}
            label="Operatives"
            iconClass="bg-fill-strong text-fg-primary"
            who={turn.guesser}
            ai={turn.guesserAi}
          />
          {turn.guessReasoning && (
            <p className="text-3xs italic leading-relaxed text-fg-secondary">
              “{turn.guessReasoning}”
            </p>
          )}
          {turn.guesses.length > 0 && (
            <ol className="flex flex-col gap-1.5">
              {turn.guesses.map((g, i) => (
                <GuessRow key={g.card} guess={g} n={i + 1} />
              ))}
            </ol>
          )}
          {turn.unplayed.length > 0 && (
            <p className="text-3xs text-fg-muted">
              Would have tried next:{" "}
              {turn.unplayed.map((u) => (
                <span key={u.word} className="font-semibold text-fg-secondary">
                  {u.word}
                  {u.confidence !== null && ` (${Math.round(u.confidence * 100)}%)`}{" "}
                </span>
              ))}
            </p>
          )}
        </section>
      )}

      {turn.end && (
        <footer
          className={cn(
            "border-t border-line-soft px-4 py-1.5 text-3xs font-semibold uppercase tracking-label",
            endTone(turn),
          )}
        >
          {turn.end}
        </footer>
      )}
    </article>
  );
}
