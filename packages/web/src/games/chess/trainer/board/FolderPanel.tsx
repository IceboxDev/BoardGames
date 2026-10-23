/**
 * The map's side panel: the selected folder (or, with none, the whole open
 * level) — how much of it you know, what's due, a button into a drill of just
 * that folder, the lines you miss most, and one quiet line on the analysis
 * farm with its details behind a toggle.
 */
import {
  type DrillCard,
  type Learning,
  learnable,
  weakestCards,
} from "@boardgames/core/games/chess/trainer/drill";
import type { RepertoireTree } from "@boardgames/core/games/chess/trainer/tree";
import type { SrsState } from "@boardgames/core/trainers/srs";
import { useMemo, useState } from "react";
import { Button, MicroLabel } from "../../../../components/ui";
import { moveLabel, routeTo } from "../tree-nav";
import type { TreeBuild } from "../useTreeBuild";
import { farmText } from "./status-text";

interface Props {
  readonly title: string;
  readonly learning: Learning;
  readonly cards: readonly DrillCard[];
  readonly states: ReadonlyMap<string, SrsState> | null;
  readonly tree: RepertoireTree | null;
  readonly farm: TreeBuild["farm"];
  /** Start a drill of these cards. */
  readonly onDrill: () => void;
  /** Show the folder's position on the board. */
  readonly onBoard: (() => void) | null;
  /** Show the folder's own subfolders on the map. */
  readonly onOpen: (() => void) | null;
  /** Show a card's position on the board. */
  readonly onShowLine: (key: string) => void;
}

const RING = 2 * Math.PI * 15;

export function FolderPanel({
  title,
  learning: l,
  cards,
  states,
  tree,
  farm,
  onDrill,
  onBoard,
  onOpen,
  onShowLine,
}: Props) {
  const [farmOpen, setFarmOpen] = useState(false);
  const total = learnable(l);
  const learntArc = total ? (l.learnt / total) * RING : 0;
  const learningArc = total ? (l.learning / total) * RING : 0;
  const weak = useMemo(() => {
    if (!states || !tree) return [];
    return weakestCards(cards, states, 4).map(({ card, lapses }) => {
      const route = routeTo(tree, card.key) ?? [];
      const text = route
        .slice(-4)
        .map((s, i) => moveLabel(route.length - Math.min(4, route.length) + i, s.san))
        .join(" ");
      return { key: card.key, text: `${route.length > 4 ? "… " : ""}${text}`, lapses };
    });
  }, [cards, states, tree]);
  const cta =
    l.due > 0
      ? `Drill ${title} · ${l.due} due`
      : l.fresh > 0
        ? `Learn new moves in ${title}`
        : total > 0
          ? `Practise ${title}`
          : null;
  const farmLine = farmText(farm);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex flex-col gap-1">
        <MicroLabel>Selected</MicroLabel>
        <h2 className="m-0 font-bold text-2xl text-fg-strong">{title}</h2>
      </div>

      <div className="flex items-center gap-4">
        <svg
          width="88"
          height="88"
          viewBox="0 0 36 36"
          role="img"
          aria-label={`${l.learnt} of ${total} moves learnt`}
        >
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            className="stroke-fill-strong"
            strokeWidth="4"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            className="stroke-accent-400/45"
            strokeWidth="4"
            strokeDasharray={`0 ${learntArc} ${learningArc} ${RING}`}
            transform="rotate(-90 18 18)"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            className="stroke-accent-400"
            strokeWidth="4"
            strokeDasharray={`${learntArc} ${RING}`}
            transform="rotate(-90 18 18)"
          />
        </svg>
        <div className="flex flex-col">
          <span className="font-mono text-3xl text-accent-300 tabular-nums">
            {l.learnt}/{total.toLocaleString()}
          </span>
          <span className="text-fg-muted text-xs">your moves learnt</span>
        </div>
      </div>

      <dl className="m-0 flex flex-col text-sm">
        <Row label="Learning" value={l.learning} />
        <Row label="Due today" value={l.due} tone="text-amber-300" />
        <Row label="New, ready to learn" value={l.fresh} />
        <Row label="Being analysed" value={l.pending} />
        {l.unasked > 0 && <Row label="Not queued for the farm" value={l.unasked} />}
        {l.unreached > 0 && <Row label="Subfolders not reached yet" value={l.unreached} />}
        {l.practisedToday > 0 && (
          <Row
            label="Practised today"
            value={`${l.practisedToday}/${l.learnt + l.learning + l.fresh}`}
            tone="text-accent-300"
          />
        )}
      </dl>

      <div className="flex flex-col gap-2">
        {cta && (
          <Button variant="primary" block onClick={onDrill}>
            {cta}
          </Button>
        )}
        <div className="flex gap-2">
          {onOpen && (
            <Button variant="secondary" size="sm" className="flex-1" onClick={onOpen}>
              Open folder
            </Button>
          )}
          {onBoard && (
            <Button variant="secondary" size="sm" className="flex-1" onClick={onBoard}>
              Show on the board
            </Button>
          )}
        </div>
      </div>

      {weak.length > 0 && (
        <div className="flex flex-col gap-1">
          <MicroLabel>Missed most</MicroLabel>
          <ul className="m-0 flex list-none flex-col p-0">
            {weak.map((w) => (
              <li key={w.key}>
                <Button
                  variant="ghost"
                  size="sm"
                  block
                  align="start"
                  onClick={() => onShowLine(w.key)}
                  className="justify-between"
                >
                  <span className="truncate font-mono text-xs">{w.text}</span>
                  <span className="shrink-0 text-amber-300 text-xs">
                    {w.lapses} {w.lapses === 1 ? "miss" : "misses"}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2 border-line-soft border-t pt-3 text-fg-muted text-xs">
        <div className="flex items-center justify-between gap-2">
          <span>
            {l.pending > 0
              ? `${l.pending} moves here are still being analysed.`
              : "Analysis is up to date here."}
          </span>
          {farmLine && (
            <Button
              variant="link"
              size="xs"
              onClick={() => setFarmOpen((o) => !o)}
              aria-expanded={farmOpen}
            >
              {farmOpen ? "Hide" : "Analysis"}
            </Button>
          )}
        </div>
        {farmOpen && farmLine && <p className="m-0 leading-relaxed">{farmLine}</p>}
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="flex justify-between border-line-soft border-b py-1.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={`m-0 font-mono tabular-nums ${tone ?? "text-fg-primary"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </dd>
    </div>
  );
}
