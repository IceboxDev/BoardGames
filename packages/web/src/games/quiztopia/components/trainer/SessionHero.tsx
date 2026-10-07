import type { TrainerOverview } from "@boardgames/core/protocol";
import { ArrowRightIcon, BookIcon } from "../../../../components/icons";
import { Button, Chip, Eyebrow, Surface } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { DISTRICTS } from "../../bands";
import { BuildingGlyph } from "../common/BuildingGlyph";
import type { StudyAllPlan } from "./session-plan";

// The hub's centrepiece: today's "Study all" session as one wide card. What
// it deals (a big count, then the mix of reviews, cards still being learned
// and new questions as one stacked bar), which districts it draws from
// (twelve toggles — tap one to leave it out or bring it back), and the
// buttons to start. When nothing is left, it says so and points at the
// archive instead.

const QUICK = 10;

type Props = {
  plan: StudyAllPlan;
  todayCounts: TrainerOverview["todayCounts"];
  /** Settings loaded: the district toggles can save. */
  canEditDistricts: boolean;
  onStart: () => void;
  onQuick: () => void;
  onToggleDistrict: (n: number) => void;
  onReadArchive: () => void;
};

export function SessionHero({
  plan,
  todayCounts,
  canEditDistricts,
  onStart,
  onQuick,
  onToggleDistrict,
  onReadArchive,
}: Props) {
  const idle = plan.total === 0;
  const included = new Set(plan.included);

  return (
    <Surface variant="raised" padding="none" className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent-500/15 via-accent-500/5 to-transparent"
      />
      <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center lg:gap-10 lg:p-8">
        <div className="flex min-w-0 flex-col gap-4">
          <Eyebrow tone="accent">Today's session</Eyebrow>

          {idle ? (
            <div className="flex flex-col gap-1">
              <p className="text-3xl font-bold text-fg-strong">All caught up</p>
              <p className="text-sm text-fg-secondary">
                {plan.excluded > 0
                  ? "Nothing due and no new cards left in the districts below — bring one back, or study a district on its own."
                  : "Nothing due and today's new cards are done. Raise the daily budget in settings to keep going."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="flex items-baseline gap-2">
                <span className="text-5xl font-bold leading-none tabular-nums text-fg-strong">
                  {plan.total}
                </span>
                <span className="text-lg text-fg-secondary">
                  {plan.total === 1 ? "card" : "cards"} to study
                </span>
              </p>
              <p className="text-sm text-fg-muted">{plan.summary}</p>
            </div>
          )}

          {!idle && <SessionMix plan={plan} />}

          <div className="flex flex-col gap-2">
            <p className="text-2xs text-fg-muted">
              Drawing from{" "}
              <span className="font-semibold tabular-nums text-fg-secondary">
                {plan.included.length} of {DISTRICTS.length}
              </span>{" "}
              districts — tap one to leave it out or bring it back
            </p>
            <ul className="flex flex-wrap gap-1.5" aria-label="Districts in Study all">
              {DISTRICTS.map((d) => {
                const on = included.has(d.n);
                return (
                  <li key={d.slug}>
                    <Chip
                      pressed={on}
                      tone={d.tone}
                      size="sm"
                      shape="pill"
                      icon={<BuildingGlyph name={d.building} lit={on} size={14} />}
                      disabled={!canEditDistricts}
                      onClick={() => onToggleDistrict(d.n)}
                      aria-label={`${d.en}: ${on ? "included — tap to leave out" : "left out — tap to include"}`}
                      title={`${d.label} · ${d.en} — ${on ? "in Study all (tap to leave out)" : "left out (tap to include)"}`}
                    >
                      {d.label}
                    </Chip>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {idle ? (
            <Button variant="secondary" size="lg" block onClick={onReadArchive}>
              <BookIcon className="h-4 w-4" />
              Read the archive
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                size="lg"
                block
                onClick={onStart}
                className="py-3 text-base"
              >
                {plan.due > 0 ? "Start session" : "Learn something new"}
                <ArrowRightIcon className="h-4 w-4" />
              </Button>
              {plan.total > QUICK && (
                <Button variant="secondary" size="lg" block onClick={onQuick}>
                  Quick {QUICK}
                  <span className="text-xs font-normal text-fg-muted">a short bite</span>
                </Button>
              )}
            </>
          )}
          <p className="text-center text-2xs text-fg-muted">
            {todayCounts.reviews > 0
              ? `Today so far: ${todayCounts.reviews} reviewed · ${todayCounts.good} knew it`
              : "Nothing studied yet today"}
          </p>
        </div>
      </div>
    </Surface>
  );
}

const MIX = [
  { key: "reviewDue", label: "reviews", bar: "bg-accent-400", dot: "bg-accent-400" },
  { key: "learningDue", label: "still learning", bar: "bg-amber-400", dot: "bg-amber-400" },
  { key: "newQuestions", label: "new", bar: "bg-emerald-400", dot: "bg-emerald-400" },
] as const;

/** One stacked bar of what the session deals, with a legend of counts. */
function SessionMix({ plan }: { plan: StudyAllPlan }) {
  const parts = MIX.map((m) => ({ ...m, value: plan[m.key] })).filter((m) => m.value > 0);
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-fill"
        role="img"
        aria-label={parts.map((p) => `${p.value} ${p.label}`).join(", ")}
      >
        {parts.map((p) => (
          <span
            key={p.key}
            className={cn("h-full first:rounded-l-full last:rounded-r-full", p.bar)}
            style={{ width: `${(p.value / plan.total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-secondary" aria-hidden="true">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", p.dot)} />
            <span className="font-semibold tabular-nums text-fg-strong">{p.value}</span>
            {p.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
