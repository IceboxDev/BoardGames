import {
  currentNightStep,
  type NightStep,
  nightCursorIndex,
  nightQueue,
  nightStepId,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import {
  describeInfo,
  type InfoPayload,
  suggestedInfo,
} from "@boardgames/core/games/blood-on-the-clocktower/info";
import { resolutionsFor } from "@boardgames/core/games/blood-on-the-clocktower/online/resolutions";
import { wakersOf } from "@boardgames/core/games/blood-on-the-clocktower/wake-prompts";
import { createRng } from "@boardgames/core/lib/rng";
import { useMemo, useState } from "react";
import { Button, Eyebrow, Input, Stepper } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { InfoCard } from "../components/InfoCard";
import { useStoryteller } from "../context";
import { chairOf, roomSeatOf, stepLabel } from "../helpers";

/** A small, stable roll for the composer's decoys: the same step suggests the same pair. */
function stepSeed(seed: number, night: number, id: string): number {
  let h = seed ^ (night * 2654435761);
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h | 0;
}

/** Edit the suggested answer where it is a number or a yes/no; anything else is sent as shown. */
function Composer({
  suggestion,
  onSend,
}: {
  suggestion: InfoPayload | null;
  onSend: (payload: InfoPayload, truth: InfoPayload | null) => void;
}) {
  const { view } = useStoryteller();
  const [edited, setEdited] = useState<InfoPayload | null>(null);
  const [text, setText] = useState("");
  const payload = edited ?? suggestion;
  return (
    <div className="flex flex-col gap-2 rounded-card-md border border-line bg-fill-soft p-3">
      {payload ? (
        <>
          <InfoCard payload={payload} names={view.names} />
          {payload.kind === "number" && (
            <Stepper
              value={payload.value}
              min={0}
              max={20}
              onChange={(value) => setEdited({ ...payload, value })}
              label="The number to show"
              size="sm"
            />
          )}
          {payload.kind === "yes-no" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEdited({ ...payload, value: !payload.value })}
            >
              Show {payload.value ? "NO" : "YES"} instead
            </Button>
          )}
          <Button size="sm" onClick={() => onSend(payload, suggestion)}>
            Show this
          </Button>
        </>
      ) : (
        <p className="text-sm text-fg-muted">Nothing to show yet.</p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onSend({ kind: "text", text: text.trim() }, suggestion);
          setText("");
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Or tell them in words…"
          maxLength={500}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!text.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

function StepCard({ step }: { step: NightStep }) {
  const { view, st } = useStoryteller();
  const state = view.companion;
  if (!state) return null;
  const id = nightStepId(step);
  const wakers = wakersOf(state, step).flatMap((c) => {
    const rs = roomSeatOf(state, c);
    return rs === undefined ? [] : [rs];
  });
  const awake = view.wake?.stepId === id;
  const answer = awake ? Object.entries(view.wake?.choices ?? {})[0] : undefined;
  const choice = answer
    ? {
        seats: answer[1].seats.flatMap((rs) => {
          const c = chairOf(state, rs);
          return c === undefined ? [] : [c];
        }),
        ...(answer[1].character ? { character: answer[1].character } : {}),
      }
    : undefined;
  const night = state.phase.kind === "night" ? state.phase.night : 0;
  const told = suggestedInfo(state, step, {
    ...(choice ? { choice } : {}),
    seatId: (c) => roomSeatOf(state, c) ?? c,
    rng: createRng(stepSeed(view.seed, night, id)),
  });
  const resolutions = resolutionsFor(state, step, choice);
  const voided = step.kind === "wake" && (step.isDrunk || step.poisoned || step.drunk === true);
  const name = (rs: number) => view.names[rs] ?? `Player ${rs}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold text-fg-strong">{stepLabel(state, step)}</h3>
        {voided && (
          <p className="text-sm text-amber-300">
            Their ability is void tonight (
            {step.kind === "wake" && step.isDrunk ? "drunk" : "poisoned or drunk"}) — you may show
            anything.
          </p>
        )}
      </div>

      {wakers.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {awake ? (
            <Button size="sm" variant="secondary" onClick={() => st({ kind: "sleep" })}>
              Put {wakers.map(name).join(", ")} to sleep
            </Button>
          ) : (
            <Button
              size="sm"
              tone="amber"
              variant="solid"
              onClick={() => st({ kind: "wake", stepId: id })}
            >
              Wake {wakers.map(name).join(", ")}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-fg-muted">Nobody wakes — settle this in the Grimoire.</p>
      )}

      {awake && (
        <p className="text-sm text-fg-secondary">
          {answer ? (
            <>
              <span className="font-semibold text-fg-strong">{name(Number(answer[0]))}</span> chose{" "}
              {answer[1].seats.length > 0 ? answer[1].seats.map(name).join(", ") : "no one"}
              {answer[1].character ? ` — the ${answer[1].character}` : ""}.
            </>
          ) : (
            "Waiting for their answer…"
          )}
        </p>
      )}

      {resolutions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Eyebrow>Apply</Eyebrow>
          {resolutions.map((r) => (
            <Button
              key={r.label}
              size="sm"
              variant="tinted"
              tone={r.grave ? "rose" : "sky"}
              align="start"
              onClick={() => st({ kind: "grimoire", action: r.action, label: r.label })}
            >
              {r.label}
            </Button>
          ))}
        </div>
      )}

      {wakers.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Eyebrow>Show them</Eyebrow>
          <Composer
            key={`${id}:${answer ? JSON.stringify(answer[1]) : ""}`}
            suggestion={told?.payload ?? null}
            onSend={(payload, truth) => {
              st({
                kind: "send-info",
                to: wakers,
                payload,
                record: true,
                ...(truth && JSON.stringify(truth) !== JSON.stringify(payload)
                  ? { truth: describeInfo(truth, name) }
                  : {}),
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

/** The night: tonight's sheet in order, and the step the Storyteller is on. */
export function NightScript() {
  const { view, st } = useStoryteller();
  const state = view.companion;
  const queue = useMemo(() => (state ? nightQueue(state) : []), [state]);
  if (!state) return null;
  const cursor = nightCursorIndex(state, queue);
  const step = currentNightStep(state);
  const go = (delta: number) => {
    if (view.wake) st({ kind: "sleep" });
    st({
      kind: "grimoire",
      action: { type: "moveNightCursor", delta },
      label: "Move the night on",
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-0.5">
        {queue.map((s, i) => {
          const done = state.nightProgress.resolved.includes(nightStepId(s));
          return (
            <li key={nightStepId(s)}>
              <Button
                size="xs"
                variant="ghost"
                align="start"
                block
                onClick={() => i !== cursor && go(i - cursor)}
                className={cn(
                  i === cursor && "bg-amber-400/15 font-semibold text-amber-200",
                  done && i !== cursor && "text-fg-muted line-through",
                )}
              >
                {stepLabel(state, s)}
              </Button>
            </li>
          );
        })}
      </ol>
      {step && step.kind !== "dawn" && <StepCard key={nightStepId(step)} step={step} />}
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" disabled={cursor <= 0} onClick={() => go(-1)}>
          ← Back
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!step || step.kind === "dawn"}
          onClick={() => go(1)}
        >
          Next step →
        </Button>
      </div>
    </div>
  );
}
