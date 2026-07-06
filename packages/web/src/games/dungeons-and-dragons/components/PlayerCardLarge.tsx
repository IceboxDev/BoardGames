import type { AbilityKey, DndCharacter } from "@boardgames/core/protocol";
import { ABILITY_KEYS, displayCharacterName } from "@boardgames/core/protocol";

// The in-game Players grid card: a mini character sheet, not just a row.
// Shows identity, combat vitals, the full ability strip, and a personality
// line — the details a DM glances for mid-session. Click for the full ledger.

const SERIF = { fontFamily: "ui-serif, Georgia, serif" } as const;

const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

function fmtMod(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

type Props = {
  character: DndCharacter;
  onView: () => void;
};

export function PlayerCardLarge({ character, onView }: Props) {
  const sheet = character.sheet;
  if (!sheet) return null;
  const shownName = displayCharacterName(sheet, character.sourceFilename);

  const identityLine = [
    sheet.race,
    sheet.class,
    sheet.level !== null ? `Level ${sheet.level}` : null,
    sheet.alignment,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    // biome-ignore lint/correctness/noRestrictedElements: full-card click target styled as a character sheet card; Button/Chip chrome doesn't fit.
    <button
      type="button"
      onClick={onView}
      className="flex h-full w-full flex-col gap-3 rounded-2xl border border-amber-400/20 bg-gradient-to-br from-[#2a0808]/80 via-surface-900/90 to-black/80 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-amber-400/45"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="font-fantasy grid h-12 w-12 shrink-0 place-items-center rounded-full bg-amber-500/20 text-xl font-bold text-amber-200 ring-1 ring-amber-400/50"
        >
          {shownName[0]?.toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-fantasy block truncate text-xl font-bold text-amber-100">
            {shownName}
          </span>
          <span className="block truncate text-xs italic text-amber-200/65" style={SERIF}>
            {identityLine}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {sheet.maxHp !== null && (
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-2xs font-bold text-rose-200 ring-1 ring-rose-400/40">
            {sheet.maxHp} HP
          </span>
        )}
        {sheet.armorClass !== null && (
          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-2xs font-bold text-sky-200 ring-1 ring-sky-400/40">
            AC {sheet.armorClass}
          </span>
        )}
        {sheet.speed && (
          <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-2xs font-bold text-fg-secondary ring-1 ring-white/10">
            {sheet.speed}
          </span>
        )}
        {sheet.abilities && (
          <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-2xs font-bold text-amber-200 ring-1 ring-amber-400/30">
            Init {fmtMod(Math.floor((sheet.abilities.dex - 10) / 2))}
          </span>
        )}
      </div>

      {sheet.abilities && (
        <div className="grid grid-cols-6 gap-1.5">
          {ABILITY_KEYS.map((key) => {
            const score = sheet.abilities?.[key];
            if (score === undefined) return null;
            return (
              <span
                key={key}
                className="flex flex-col items-center rounded-lg border border-amber-400/20 bg-[#1a0606]/70 py-1.5"
              >
                <span className="text-4xs font-bold uppercase tracking-widest text-amber-300/60">
                  {ABILITY_LABEL[key]}
                </span>
                <span className="font-fantasy text-sm font-bold text-amber-100">{score}</span>
                <span className="text-3xs text-amber-200/50">{fmtMod(score)}</span>
              </span>
            );
          })}
        </div>
      )}

      {(sheet.spells.length > 0 || sheet.equipment.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {sheet.spells.length > 0 && (
            <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-3xs font-semibold uppercase tracking-[0.12em] text-purple-200/80 ring-1 ring-purple-400/25">
              {sheet.spells.length} spells
            </span>
          )}
          {sheet.equipment.length > 0 && (
            <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-3xs font-semibold uppercase tracking-[0.12em] text-fg-secondary ring-1 ring-white/10">
              {sheet.equipment.length} items
            </span>
          )}
          {sheet.proficiencies.length > 0 && (
            <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-3xs font-semibold uppercase tracking-[0.12em] text-fg-secondary ring-1 ring-white/10">
              {sheet.proficiencies.length} proficiencies
            </span>
          )}
        </div>
      )}

      {sheet.personality && (
        <p className="line-clamp-2 text-xs leading-relaxed text-amber-200/60" style={SERIF}>
          {sheet.personality}
        </p>
      )}
    </button>
  );
}
