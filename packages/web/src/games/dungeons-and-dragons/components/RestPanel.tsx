import type { DndCharacter } from "@boardgames/core/protocol";
import { displayCharacterName } from "@boardgames/core/protocol";
import { useState } from "react";
import { Button, Input } from "../../../components/ui";

// The short-rest node's bookkeeping panel: who rests, who spends how many
// hit dice for how much healing, and what the rest of the party does with
// the hour. Logging writes the outcome into the chronicle; hp itself lives
// on the players' sheets at the table.

type RestRow = {
  resting: boolean;
  hitDice: string;
  hpRegained: string;
  activity: string;
};

type Props = {
  party: DndCharacter[];
  onLog: (text: string) => void;
  logPending: boolean;
  /** Persist healed hp per resting character (current + regained, capped). */
  onStateUpdates: (updates: { characterId: string; hp: number; notes: string }[]) => void;
};

export function RestPanel({ party, onLog, logPending, onStateUpdates }: Props) {
  const [rows, setRows] = useState<Record<string, RestRow>>(() =>
    Object.fromEntries(
      party.map((ch) => [ch.id, { resting: true, hitDice: "", hpRegained: "", activity: "" }]),
    ),
  );

  const patch = (id: string, part: Partial<RestRow>) =>
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] as RestRow), ...part } }));

  const buildLog = (): string => {
    const lines: string[] = ["The party takes a short rest."];
    for (const ch of party) {
      const row = rows[ch.id];
      if (!row) continue;
      const name = displayCharacterName(ch.sheet, ch.sourceFilename);
      if (row.resting) {
        const dice = Number.parseInt(row.hitDice, 10);
        const hp = Number.parseInt(row.hpRegained, 10);
        if (Number.isFinite(dice) && dice > 0) {
          lines.push(
            `${name} spends ${dice} hit ${dice === 1 ? "die" : "dice"}${
              Number.isFinite(hp) && hp > 0 ? ` and regains ${hp} HP` : ""
            }.`,
          );
        } else if (row.activity.trim()) {
          lines.push(`${name} rests — ${row.activity.trim()}.`);
        } else {
          lines.push(`${name} rests without spending hit dice.`);
        }
      } else {
        lines.push(
          row.activity.trim()
            ? `${name} does not rest — ${row.activity.trim()}.`
            : `${name} does not rest.`,
        );
      }
    }
    return lines.join(" ");
  };

  return (
    <div className="shrink-0 rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-dnd-rest/70 via-surface-900/85 to-black/80 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-serif-body text-3xs font-bold uppercase tracking-eyebrow text-emerald-300/80">
          Short rest — one hour
        </p>
        <Button
          variant="tinted"
          tone="amber"
          size="xs"
          loading={logPending}
          onClick={() => {
            const updates: { characterId: string; hp: number; notes: string }[] = [];
            for (const ch of party) {
              const row = rows[ch.id];
              const max = ch.sheet?.maxHp ?? null;
              if (!row || !row.resting || max === null) continue;
              const regained = Number.parseInt(row.hpRegained, 10);
              if (!Number.isFinite(regained) || regained <= 0) continue;
              const current = ch.state?.hp ?? max;
              updates.push({
                characterId: ch.id,
                hp: Math.min(max, current + regained),
                notes: ch.state?.notes ?? "",
              });
            }
            if (updates.length > 0) onStateUpdates(updates);
            onLog(buildLog());
          }}
        >
          Log rest
        </Button>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {party.map((ch) => {
          const row = rows[ch.id];
          if (!row) return null;
          const name = displayCharacterName(ch.sheet, ch.sourceFilename);
          return (
            <li
              key={ch.id}
              className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${
                row.resting
                  ? "border-emerald-400/20 bg-black/25"
                  : "border-white/10 bg-black/15 opacity-90"
              }`}
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={row.resting}
                  onChange={(e) => patch(ch.id, { resting: e.target.checked })}
                  className="h-4 w-4 shrink-0 accent-emerald-400"
                />
                <span className="font-fantasy truncate text-sm font-bold text-amber-100">
                  {name}
                </span>
                {ch.sheet?.maxHp != null && (
                  <span
                    className={`shrink-0 text-3xs font-bold ${
                      (ch.state?.hp ?? ch.sheet.maxHp) < ch.sheet.maxHp
                        ? "text-rose-300"
                        : "text-emerald-300/70"
                    }`}
                  >
                    {ch.state?.hp ?? ch.sheet.maxHp}/{ch.sheet.maxHp} HP
                  </span>
                )}
              </label>
              {row.resting ? (
                <span className="flex shrink-0 items-center gap-1.5">
                  <Input
                    inputMode="numeric"
                    width="score"
                    placeholder="HD"
                    aria-label={`${name} hit dice spent`}
                    value={row.hitDice}
                    onChange={(e) => patch(ch.id, { hitDice: e.target.value })}
                  />
                  <span className="text-3xs uppercase tracking-label text-emerald-200/60">
                    dice →
                  </span>
                  <Input
                    inputMode="numeric"
                    width="score"
                    placeholder="HP"
                    aria-label={`${name} hp regained`}
                    value={row.hpRegained}
                    onChange={(e) => patch(ch.id, { hpRegained: e.target.value })}
                  />
                </span>
              ) : (
                <Input
                  placeholder="keeping watch, scouting ahead…"
                  aria-label={`${name} activity during the rest`}
                  value={row.activity}
                  onChange={(e) => patch(ch.id, { activity: e.target.value })}
                  className="w-56 shrink-0"
                />
              )}
            </li>
          );
        })}
      </ul>
      <p className="font-serif-body mt-2 text-3xs leading-relaxed text-emerald-200/40">
        Hit dice heal die + CON each; logging writes the outcome into the chronicle as ground truth
        for the sages and the referee.
      </p>
    </div>
  );
}
