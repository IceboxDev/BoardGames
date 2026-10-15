import { cardIdName } from "@boardgames/core/games/7-wonders/types";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { cn } from "../../../../lib/cn";
import { AGE_NUMERAL, COLOR_HEX, COLOR_LABEL } from "../../card-utils";
import {
  balance,
  type ChainGroup,
  type ChainNode,
  chainGroups,
  chainSections,
  copiesAt,
} from "../../logic/chains";
import type { DraftInteraction } from "../../logic/useDraftInteraction";
import CardArt from "../CardArt";
import { EffectIcons } from "../CardBits";
import CardPreview from "../CardPreview";
import SevenIcon from "../SevenIcon";

/** Node and gutter sizes (CSS px; the board is fitted to the screen as a whole). */
const W = 168;
const H = 56;
const GAP_X = 44;
const GAP_Y = 12;
const PAD = 12;
const GROUP_W = 3 * W + 2 * GAP_X + 2 * PAD;

const x = (age: number) => PAD + (age - 1) * (W + GAP_X);
const y = (row: number) => PAD + row * (H + GAP_Y);
/** A section's title row, in px. */
const SECTION_HEAD = 28;
const groupH = (g: ChainGroup) => 2 * PAD + g.rows * H + (g.rows - 1) * GAP_Y;

type State = "built" | "free" | "open" | "absent";

/**
 * Every chain in the game — owning one card lets you build a later one for
 * free — as families laid out Age Ⅰ → Ⅱ → Ⅲ. Each card shows how many
 * copies this table deals; cards already in your city are green, the free
 * builds they open for you are gold, and cards in your hand are tagged.
 * Families are sorted by the colour of the card they start from.
 */
export default function ChainsView({ ix }: { ix: DraftInteraction }) {
  const reduced = useReducedMotion();
  const { view, myIndex } = ix;
  const players = view.playerCount;
  const groups = useMemo(() => chainGroups(), []);
  const columns = useMemo(
    () =>
      balance(
        chainSections(groups),
        (sec) => SECTION_HEAD + sec.groups.reduce((h, g) => h + groupH(g) + 12, 0),
        2,
      ),
    [groups],
  );

  const mine = new Set((view.players[myIndex]?.tableau ?? []).map(cardIdName));
  const hand = new Set(ix.hand.map(cardIdName));
  const state = (n: ChainNode, g: ChainGroup): State => {
    if (mine.has(n.name)) return "built";
    if (copiesAt(n.def, players) === 0) return "absent";
    const fed = g.edges.some((e) => e.to === n.name && mine.has(e.from));
    return fed ? "free" : "open";
  };
  const freeNow = groups.flatMap((g) => g.nodes.filter((n) => state(n, g) === "free"));
  const freeInHand = freeNow.filter((n) => hand.has(n.name));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-2 px-1">
        <div className="flex flex-col">
          <h2 className="font-fantasy text-2xl font-bold text-amber-200">Chains</h2>
          <p className="text-xs text-fg-secondary">
            A card you own lets you build the card it points to for free, in a later Age.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-2xs text-fg-secondary">
          <Legend
            className="bg-emerald-500/15 text-emerald-200 ring-emerald-400/70"
            label="In your city"
            mark="✓"
          />
          <Legend
            className="bg-amber-400/15 text-amber-200 ring-amber-300/70"
            label="Free for you now"
          />
          <span className="flex items-center gap-1.5">
            <span className="flex h-3.5 items-center rounded-full bg-accent-500 px-1 text-6xs font-bold uppercase tracking-label text-on-accent">
              Hand
            </span>
            In your hand
          </span>
          <span className="rounded-full bg-fill px-2 py-0.5 ring-1 ring-line">
            <span className="font-bold text-fg-primary">×2</span> copies at {players} players
          </span>
        </div>
        <div
          className={cn(
            "ml-auto flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1",
            freeNow.length > 0
              ? "bg-amber-400/10 text-amber-200 ring-amber-300/40"
              : "bg-fill text-fg-muted ring-line",
          )}
        >
          <SevenIcon name="chain" className="h-4 w-4" />
          {freeNow.length === 0
            ? "No free builds yet"
            : `${freeNow.length} free build${freeNow.length === 1 ? "" : "s"} open to you${
                freeInHand.length > 0 ? ` · ${freeInHand.length} in your hand` : ""
              }`}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card-xl bg-surface-950/45 ring-1 ring-black/50">
        {/* The Ages, fixed above the scroll: nothing ever slides behind them. */}
        <div className="flex shrink-0 justify-center gap-4 border-b border-line-soft bg-surface-900/80 px-3 py-2">
          {columns.map((_, c) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: two fixed columns
            <div key={c} className="flex" style={{ width: GROUP_W }}>
              {([1, 2, 3] as const).map((age) => (
                <span
                  key={age}
                  className="text-center font-fantasy text-sm font-bold text-amber-100/85"
                  style={{ width: W, marginLeft: age === 1 ? PAD : GAP_X }}
                >
                  Age {AGE_NUMERAL[age]}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div
          className="min-h-0 flex-1 overflow-auto p-3"
          // Cards fade out as they scroll up under the Ages, never cut hard.
          style={{
            maskImage: "linear-gradient(180deg, transparent, black 14px)",
            WebkitMaskImage: "linear-gradient(180deg, transparent, black 14px)",
          }}
        >
          <div className="mx-auto flex w-fit items-start gap-4">
            {columns.map((col, c) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: two fixed columns
              <div key={c} className="flex flex-col gap-3" style={{ width: GROUP_W }}>
                {col.map((sec) => (
                  <section key={sec.color} className="flex flex-col gap-2">
                    <h3
                      className="flex items-center gap-2 px-1 text-3xs font-semibold uppercase tracking-label text-fg-secondary"
                      style={{ height: SECTION_HEAD - 8 }}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full ring-1 ring-black/40"
                        style={{ backgroundColor: COLOR_HEX[sec.color] }}
                      />
                      {COLOR_LABEL[sec.color]}
                      <span className="font-normal normal-case tracking-normal text-fg-muted">
                        · {sec.groups.length} chain{sec.groups.length === 1 ? "" : "s"}
                      </span>
                      <span
                        aria-hidden
                        className="ml-1 h-px flex-1"
                        style={{
                          background: `linear-gradient(90deg, ${COLOR_HEX[sec.color]}80, transparent)`,
                        }}
                      />
                    </h3>
                    {sec.groups.map((g, k) => (
                      <motion.div
                        key={g.nodes[0]?.name}
                        initial={reduced ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: reduced ? 0 : k * 0.04 }}
                        className="relative rounded-card-xl bg-surface-900/70 ring-1 ring-line-soft"
                        style={{
                          width: GROUP_W,
                          height: groupH(g),
                          boxShadow: `inset 3px 0 0 ${COLOR_HEX[sec.color]}99`,
                        }}
                      >
                        <Links group={g} built={mine} />
                        {g.nodes.map((n) => (
                          <Node
                            key={n.name}
                            node={n}
                            state={state(n, g)}
                            inHand={hand.has(n.name)}
                            copies={copiesAt(n.def, players)}
                            players={players}
                          />
                        ))}
                      </motion.div>
                    ))}
                  </section>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The links of one family: a curve from each card to the card it frees. */
function Links({ group, built }: { group: ChainGroup; built: ReadonlySet<string> }) {
  const at = new Map(group.nodes.map((n) => [n.name, n]));
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      width={GROUP_W}
      height={groupH(group)}
    >
      {group.edges.map(({ from, to }) => {
        const a = at.get(from);
        const b = at.get(to);
        if (!a || !b) return null;
        const x1 = x(a.age) + W;
        const y1 = y(a.row) + H / 2;
        const x2 = x(b.age);
        const y2 = y(b.row) + H / 2;
        const mid = (x1 + x2) / 2;
        const live = built.has(from);
        const done = live && built.has(to);
        // Green: both cards in your city. Gold: a free build it opens for you.
        const stroke = done ? "#34d399" : live ? "#fcd34d" : "rgb(255 255 255 / 0.22)";
        return (
          <g key={`${from}>${to}`}>
            <path
              d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2 - 4},${y2}`}
              fill="none"
              stroke={stroke}
              strokeWidth={live ? 2 : 1.5}
              strokeDasharray={live ? undefined : "4 4"}
              strokeLinecap="round"
            />
            <circle cx={x1} cy={y1} r={2.5} fill={stroke} />
            <path d={`M${x2 - 7},${y2 - 4} L${x2 - 1},${y2} L${x2 - 7},${y2 + 4}`} fill={stroke} />
          </g>
        );
      })}
    </svg>
  );
}

function Node({
  node,
  state,
  inHand,
  copies,
  players,
}: {
  node: ChainNode;
  state: State;
  inHand: boolean;
  copies: number;
  players: number;
}) {
  const effects = node.def.effects;
  return (
    <div className="absolute" style={{ left: x(node.age), top: y(node.row), width: W, height: H }}>
      <CardPreview cardId={`${node.name}@${node.age}#0`} className="h-full w-full">
        <div
          className={cn(
            "relative flex h-full w-full items-center gap-2 rounded-ui-lg py-1 pl-1 pr-2 shadow-lg ring-1 transition-[box-shadow,background]",
            state === "built" && "bg-emerald-500/15 ring-emerald-400/70",
            state === "free" && "bg-amber-400/15 ring-amber-300/80 shadow-glow-amber",
            state === "open" && "bg-surface-950/85 ring-line",
            state === "absent" && "bg-surface-950/60 opacity-40 ring-line-soft",
          )}
          title={
            state === "absent"
              ? `${node.name} isn't dealt with ${players} players`
              : `${node.name} — ${copies} cop${copies === 1 ? "y" : "ies"} at ${players} players`
          }
        >
          <span
            className="h-12 w-8 shrink-0 overflow-hidden rounded-ui-md ring-1 ring-black/50"
            style={{ boxShadow: `0 0 0 1px ${COLOR_HEX[node.color]}66` }}
          >
            <CardArt
              cardId={`${node.name}@${node.age}#0`}
              variant="mini"
              className="rounded-none ring-0"
            />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-2xs font-semibold leading-none text-fg-strong">
              {node.name}
            </span>
            <span className="flex min-w-0 items-center gap-0.5 overflow-hidden">
              {effects.map((e, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a card's effects never reorder
                <EffectIcons key={i} effect={e} size="xs" />
              ))}
            </span>
          </span>
          <span className="self-start pt-0.5 text-4xs font-bold tabular-nums text-fg-muted">
            ×{copies}
          </span>
          {state === "built" && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-4xs font-bold text-surface-950 shadow ring-2 ring-surface-900">
              ✓
            </span>
          )}
          {state === "free" && (
            <span className="absolute -right-2 -top-2 flex h-4 items-center rounded-full bg-amber-300 px-1.5 text-5xs font-bold uppercase tracking-label text-surface-950 shadow ring-2 ring-surface-900">
              Free
            </span>
          )}
          {inHand && (
            <span className="absolute -bottom-2 right-2 flex h-4 items-center rounded-full bg-accent-500 px-1.5 text-5xs font-bold uppercase tracking-label text-on-accent shadow ring-2 ring-surface-900">
              In hand
            </span>
          )}
        </div>
      </CardPreview>
    </div>
  );
}

function Legend({ className, label, mark }: { className: string; label: string; mark?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          "relative flex h-3.5 w-5 items-center justify-center rounded-ui-md ring-1 text-5xs font-bold text-amber-200",
          className,
        )}
      >
        {mark}
      </span>
      {label}
    </span>
  );
}
