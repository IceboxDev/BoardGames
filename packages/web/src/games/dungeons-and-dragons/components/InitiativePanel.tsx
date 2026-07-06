import type { DndCharacter, DndNode, DndNpc } from "@boardgames/core/protocol";
import { displayCharacterName } from "@boardgames/core/protocol";
import { useEffect, useId, useState } from "react";
import { MinusIcon, PlusIcon } from "../../../components/icons";
import { Button, Input, Select } from "../../../components/ui";

// The initiative tracker — what an `initiative` node opens instead of a
// conversation. The DM types the players' RAW d20 rolls (the tracker adds
// each PC's DEX bonus) and rolls here for the opposition — ONE roll per
// creature group (the 5e group-initiative rule; a ×N badge shows the head
// count, and the split button breaks a group out when a fight calls for it).
// A module escalation table ("Further Danger") can be rolled from here and
// its result seated. "Enter combat" lives in the game screen's action bar.

const SERIF = { fontFamily: "ui-serif, Georgia, serif" } as const;

function dexMod(dex: number | undefined | null): number {
  return dex === undefined || dex === null ? 0 : Math.floor((dex - 10) / 2);
}

function fmtMod(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function rollD20(mod: number): number {
  return Math.floor(Math.random() * 20) + 1 + mod;
}

type EnemyRow = { key: number; name: string; count: number; mod: number; roll: string };

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  "a pair of": 2,
  "a couple of": 2,
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "three dead vines" / "3 dead vines" near the creature's name → 3. */
function inferCount(haystack: string, lowerName: string): number {
  const stem = lowerName.replace(/s$/, "");
  // Accept regular plurals (vine→vines) and f→ves (wolf→wolves).
  const variants = [`${escapeRegex(stem)}(?:s|es)?`];
  if (stem.endsWith("f")) variants.push(`${escapeRegex(stem.slice(0, -1))}ves`);
  const pattern = new RegExp(
    `(\\d+|${Object.keys(NUMBER_WORDS).join("|")})\\s+(?:[a-z-]+\\s+){0,2}?(?:${variants.join("|")})\\b`,
  );
  const match = haystack.match(pattern);
  if (!match?.[1]) return 1;
  const token = match[1];
  const parsed = Number.parseInt(token, 10);
  const count = Number.isFinite(parsed) ? parsed : (NUMBER_WORDS[token] ?? 1);
  return Math.min(12, Math.max(1, count));
}

type Props = {
  node: DndNode;
  party: DndCharacter[];
  npcs: DndNpc[];
  /** Emits a loggable summary of the current turn order (null when empty). */
  onOrderChange?: (summary: string | null) => void;
};

export function InitiativePanel({ node, party, npcs, onOrderChange }: Props) {
  const uid = useId();
  const [pcRolls, setPcRolls] = useState<Record<string, string>>({});
  const [addNpcId, setAddNpcId] = useState("");
  const [dangerPick, setDangerPick] = useState("");
  const [nextKey, setNextKey] = useState(1000);

  // Pre-seat the opposition the node's text mentions — one GROUP row per
  // creature type, with the head count inferred from the wording ("three
  // dead vines" → ×3). The generation prompts instruct initiative summaries
  // to state counts.
  const [enemies, setEnemies] = useState<EnemyRow[]>(() => {
    const haystack = `${node.summary} ${node.readText}`.toLowerCase();
    return npcs
      .filter((npc) => haystack.includes(npc.name.toLowerCase()))
      .map((npc, i) => ({
        key: i,
        name: npc.name,
        count: inferCount(haystack, npc.name.toLowerCase()),
        mod: dexMod(npc.abilities?.dex),
        roll: "",
      }));
  });

  const addEnemy = () => {
    const npc = npcs.find((n) => n.id === addNpcId);
    if (!npc) return;
    setEnemies([
      ...enemies,
      { key: nextKey, name: npc.name, count: 1, mod: dexMod(npc.abilities?.dex), roll: "" },
    ]);
    setNextKey(nextKey + 1);
  };

  const bumpCount = (key: number, delta: number) => {
    setEnemies(
      enemies.flatMap((e) => {
        if (e.key !== key) return [e];
        const count = e.count + delta;
        return count <= 0 ? [] : [{ ...e, count }];
      }),
    );
  };

  const unleashDanger = () => {
    const entry = node.dangerTable?.entries.find((e) => e.roll === dangerPick);
    if (!entry) return;
    const lower = entry.text.toLowerCase();
    const matched = npcs.filter((npc) => lower.includes(npc.name.toLowerCase()));
    const rows: EnemyRow[] =
      matched.length > 0
        ? matched.map((npc, i) => ({
            key: nextKey + i,
            name: npc.name,
            count: inferCount(lower, npc.name.toLowerCase()),
            mod: dexMod(npc.abilities?.dex),
            roll: "",
          }))
        : [{ key: nextKey, name: entry.text.replace(/\.$/, ""), count: 1, mod: 0, roll: "" }];
    setEnemies([...enemies, ...rows]);
    setNextKey(nextKey + rows.length);
    setDangerPick("");
  };

  const enemyLabel = (e: EnemyRow) => (e.count > 1 ? `${e.name} ×${e.count}` : e.name);

  const order = [
    ...party
      .filter((ch) => ch.sheet)
      .map((ch) => {
        const raw = Number.parseInt(pcRolls[ch.id] ?? "", 10);
        return {
          label: displayCharacterName(ch.sheet, ch.sourceFilename),
          kind: "pc" as const,
          // The DM types the raw d20 — the character's initiative bonus
          // (DEX modifier) is added here.
          value: raw + dexMod(ch.sheet?.abilities?.dex),
        };
      }),
    ...enemies.map((e) => ({
      label: enemyLabel(e),
      kind: "enemy" as const,
      value: Number.parseInt(e.roll, 10),
    })),
  ]
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => b.value - a.value);

  // Surface a loggable summary to the game screen's "Enter combat" button.
  const summary =
    order.length > 0
      ? `${node.summary} Turn order: ${order.map((r) => `${r.label} ${r.value}`).join(", ")}.`
      : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: summary is derived from the states below; reporting it upward on change is the point.
  useEffect(() => {
    onOrderChange?.(summary);
  }, [summary]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
      <div className="shrink-0 rounded-2xl border border-rose-400/30 bg-gradient-to-br from-[#2a0808]/90 via-surface-900/85 to-black/80 p-4">
        <p className="text-3xs font-bold uppercase tracking-[0.3em] text-rose-300/80" style={SERIF}>
          Combat — roll initiative
        </p>
        <p
          className="mt-2 whitespace-pre-line text-base leading-relaxed text-amber-100/90"
          style={SERIF}
        >
          {node.readText}
        </p>
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-3 lg:grid-cols-2">
        {/* The party — the DM enters their raw d20 rolls. */}
        <div className="rounded-2xl border border-amber-400/20 bg-black/25 p-3">
          <p
            className="text-3xs font-bold uppercase tracking-[0.25em] text-amber-300/60"
            style={SERIF}
          >
            The party — enter their d20 rolls
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {party
              .filter((ch) => ch.sheet)
              .map((ch) => (
                <li key={ch.id} className="flex items-center gap-2">
                  <label
                    htmlFor={`${uid}-${ch.id}`}
                    className="min-w-0 flex-1 truncate text-sm text-amber-100"
                  >
                    {displayCharacterName(ch.sheet, ch.sourceFilename)}
                    <span className="ml-1.5 text-3xs text-amber-200/40">
                      DEX {fmtMod(dexMod(ch.sheet?.abilities?.dex))}
                    </span>
                  </label>
                  <Input
                    id={`${uid}-${ch.id}`}
                    inputMode="numeric"
                    width="score"
                    placeholder="d20"
                    value={pcRolls[ch.id] ?? ""}
                    onChange={(e) => setPcRolls({ ...pcRolls, [ch.id]: e.target.value })}
                  />
                  <span className="w-9 shrink-0 text-center font-fantasy text-base font-bold text-amber-100">
                    {Number.isFinite(Number.parseInt(pcRolls[ch.id] ?? "", 10))
                      ? `= ${Number.parseInt(pcRolls[ch.id] ?? "", 10) + dexMod(ch.sheet?.abilities?.dex)}`
                      : ""}
                  </span>
                </li>
              ))}
          </ul>
        </div>

        {/* The opposition — one roll per creature group. */}
        <div className="rounded-2xl border border-rose-400/20 bg-black/25 p-3">
          <div className="flex items-center justify-between gap-2">
            <p
              className="text-3xs font-bold uppercase tracking-[0.25em] text-rose-300/60"
              style={SERIF}
            >
              The opposition — one roll per group
            </p>
            <Button
              variant="ghost"
              size="xs"
              disabled={enemies.length === 0 || enemies.every((e) => e.roll.trim() !== "")}
              onClick={() =>
                setEnemies(
                  enemies.map((e) =>
                    e.roll.trim() === "" ? { ...e, roll: String(rollD20(e.mod)) } : e,
                  ),
                )
              }
            >
              Roll all
            </Button>
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {enemies.map((enemy) => (
              <li key={enemy.key} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-rose-100/90">
                  {enemy.name}
                  {enemy.count > 1 && (
                    <span className="ml-1 rounded-full bg-rose-500/15 px-1.5 text-3xs font-bold text-rose-200 ring-1 ring-rose-400/30">
                      ×{enemy.count}
                    </span>
                  )}
                  <span className="ml-1.5 text-3xs text-rose-200/40">DEX {fmtMod(enemy.mod)}</span>
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={`Fewer ${enemy.name}`}
                  className="text-rose-200/40 hover:text-rose-200"
                  onClick={() => bumpCount(enemy.key, -1)}
                >
                  <MinusIcon className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={`More ${enemy.name}`}
                  className="text-rose-200/40 hover:text-rose-200"
                  onClick={() => bumpCount(enemy.key, 1)}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                </Button>
                <Input
                  inputMode="numeric"
                  width="score"
                  placeholder="init"
                  aria-label={`${enemy.name} initiative`}
                  value={enemy.roll}
                  onChange={(e) =>
                    setEnemies(
                      enemies.map((row) =>
                        row.key === enemy.key ? { ...row, roll: e.target.value } : row,
                      ),
                    )
                  }
                />
                <Button
                  variant="tinted"
                  tone="rose"
                  size="xs"
                  onClick={() =>
                    setEnemies(
                      enemies.map((e) =>
                        e.key === enemy.key ? { ...e, roll: String(rollD20(e.mod)) } : e,
                      ),
                    )
                  }
                >
                  Roll
                </Button>
              </li>
            ))}
            {enemies.length === 0 && (
              <li className="text-xs text-rose-200/40" style={SERIF}>
                No combatants recognized — add them below.
              </li>
            )}
          </ul>
          <div className="mt-2 flex items-center gap-2">
            <Select
              value={addNpcId}
              onChange={(e) => setAddNpcId(e.target.value)}
              className="min-w-0 flex-1"
            >
              <option value="">Add a combatant…</option>
              {npcs.map((npc) => (
                <option key={npc.id} value={npc.id}>
                  {npc.name} (DEX {fmtMod(dexMod(npc.abilities?.dex))})
                </option>
              ))}
            </Select>
            <Button variant="tinted" tone="rose" size="xs" disabled={!addNpcId} onClick={addEnemy}>
              Add
            </Button>
          </div>
        </div>
      </div>

      {/* The module's escalation table, when the encounter carries one. */}
      {node.dangerTable && (
        <div className="shrink-0 rounded-2xl border border-rose-400/30 bg-gradient-to-br from-[#3a0a0a]/70 via-black/30 to-black/40 p-3">
          <p
            className="text-3xs font-bold uppercase tracking-[0.25em] text-rose-300/80"
            style={SERIF}
          >
            Further danger — roll {node.dangerTable.die}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-200/65" style={SERIF}>
            {node.dangerTable.description}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Select
              value={dangerPick}
              onChange={(e) => setDangerPick(e.target.value)}
              className="min-w-0 flex-1"
            >
              <option value="">What did the {node.dangerTable.die} show?</option>
              {node.dangerTable.entries.map((entry) => (
                <option key={entry.roll} value={entry.roll}>
                  {entry.roll} — {entry.text}
                </option>
              ))}
            </Select>
            <Button
              variant="tinted"
              tone="rose"
              size="xs"
              disabled={!dangerPick}
              onClick={unleashDanger}
            >
              Unleash
            </Button>
          </div>
        </div>
      )}

      {/* Live turn order. */}
      <div className="shrink-0 rounded-2xl border border-amber-400/20 bg-black/25 p-3">
        <p
          className="text-3xs font-bold uppercase tracking-[0.25em] text-amber-300/60"
          style={SERIF}
        >
          Turn order
        </p>
        {order.length === 0 ? (
          <p className="mt-2 text-xs text-amber-200/40" style={SERIF}>
            Enter and roll initiative above — the order forms here.
          </p>
        ) : (
          <ol className="mt-2 flex flex-wrap items-center gap-2">
            {order.map((row, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: display-only sorted chips recomputed every render (duplicate names/values are legal); no element state to preserve.
                key={`${row.label}-${i}`}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ${
                  row.kind === "pc"
                    ? "bg-amber-400/10 text-amber-100 ring-amber-400/30"
                    : "bg-rose-500/10 text-rose-100 ring-rose-400/30"
                }`}
              >
                <span className="font-fantasy font-bold">{row.value}</span>
                {row.label}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
