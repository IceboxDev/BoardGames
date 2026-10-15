import { type ClueCount, formatClueCount } from "@boardgames/core/games/codenames/clue-rules";
import { Button } from "../../../components/ui";
import { ThinkingLine } from "./TableHeader";
import { TurnTimer } from "./TurnTimer";

// A clue question in the turn header's centre slot. The rulebook: a clue
// that only shares spelling with a table word (SPARROW while ROW is out) is
// valid "if the opposing spymaster allows it … ask your opponent (quietly, so
// the others can't hear)". So the two spymasters see the word; everyone else
// sees only that a question is open — as they would see a whisper at the
// table. No answer by the deadline and the clue stands: "If no one notices
// that a clue is invalid, it counts as valid."

/** The opposing spymaster: allow or refuse. */
export function AppealRuling({
  asker,
  word,
  clash,
  deadlineTs,
  onRule,
}: {
  asker: string;
  word: string;
  clash: string;
  deadlineTs: number;
  onRule: (allow: boolean) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <p className="min-w-0 text-xs leading-snug text-fg-secondary">
        <span className="font-semibold text-fg-primary">{asker}</span> asks: may{" "}
        <span className="font-black uppercase tracking-pill text-fg-strong">{word}</span> stand
        while <span className="font-black uppercase tracking-pill text-fg-strong">{clash}</span> is
        on the table?
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="primary" onClick={() => onRule(true)}>
          Allow
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onRule(false)}>
          Refuse
        </Button>
        <span title="No answer by then and the clue stands">
          <TurnTimer deadlineTs={deadlineTs} />
        </span>
      </div>
    </div>
  );
}

/** The asking spymaster, waiting: the question, and a way to take it back. */
export function AppealPending({
  judge,
  word,
  count,
  judging,
  deadlineTs,
  onWithdraw,
}: {
  judge: string;
  word: string;
  count: ClueCount | null;
  /** An AI judge is thinking it over. */
  judging: boolean;
  deadlineTs: number;
  onWithdraw: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <p className="min-w-0 text-xs leading-snug text-fg-secondary">
        Asked <span className="font-semibold text-fg-primary">{judge}</span> about{" "}
        <span className="font-black uppercase tracking-pill text-fg-strong">
          {word}
          {count !== null && ` ${formatClueCount(count)}`}
        </span>
        {judging ? " — thinking it over…" : " — waiting for an answer."}
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="ghost" onClick={onWithdraw}>
          Withdraw
        </Button>
        {!judging && (
          <span title="No answer by then and the clue stands">
            <TurnTimer deadlineTs={deadlineTs} />
          </span>
        )}
      </div>
    </div>
  );
}

/** Everyone else: a question is open between the spymasters. */
export function AppealWatch({ asker, judge }: { asker: string; judge: string }) {
  return <ThinkingLine who={asker} what={`is checking a clue with ${judge}…`} />;
}
