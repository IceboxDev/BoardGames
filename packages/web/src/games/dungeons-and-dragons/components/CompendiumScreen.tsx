import type { DndNpc } from "@boardgames/core/protocol";
import { useMemo, useState } from "react";
import { D20Die } from "../../../components/offline/D20Die";
import { Button, EmptyState, Input } from "../../../components/ui";
import { getCompendiumEntry, listCompendiumTerms } from "../logic/compendium";
import { listMonsterEntries } from "../logic/monsters";
import { getSpellEntry, listSpellNames, spellLevelLabel } from "../logic/spellbook";
import { DndPanel, StatPill } from "./ui";

// The Compendium: every monster, item, spell, and reference the table can
// reach for — with the running campaign's own cast & monsters shelved at
// the top. One search box filters everything.

function SectionHeading({ children, count }: { children: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2 px-1">
      <h3 className="font-serif-body text-3xs font-bold uppercase tracking-eyebrow text-amber-300/60">
        {children}
      </h3>
      <span className="text-3xs text-amber-200/30">{count}</span>
    </div>
  );
}

type Props = {
  npcs: DndNpc[];
  onOpenNpc: (npc: DndNpc) => void;
  recharting: boolean;
  onRecharter: () => void;
  recharterPending: boolean;
  recharterError: string | null;
};

export function CompendiumScreen({
  npcs,
  onOpenNpc,
  recharting,
  onRecharter,
  recharterPending,
  recharterError,
}: Props) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const monsters = useMemo(() => listMonsterEntries(), []);
  const spells = useMemo(() => listSpellNames().flatMap((name) => getSpellEntry(name) ?? []), []);
  const items = useMemo(
    () => listCompendiumTerms().flatMap((term) => getCompendiumEntry(term) ?? []),
    [],
  );

  const cast = npcs.filter((npc) => !q || npc.name.toLowerCase().includes(q));
  const beasts = monsters.filter((m) => !q || m.name.toLowerCase().includes(q));
  const knownSpells = spells.filter((s) => !q || s.name.toLowerCase().includes(q));
  const gear = items.filter((e) => !q || e.title.toLowerCase().includes(q));
  const nothing =
    cast.length === 0 && beasts.length === 0 && knownSpells.length === 0 && gear.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pt-3">
      <div className="flex shrink-0 items-center gap-3 px-1">
        <Input
          placeholder="Search the compendium — monsters, spells, gear…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-md flex-1"
        />
        <p className="font-serif-body hidden text-2xs text-amber-200/40 sm:block">
          The table's library — the campaign's cast first, the wider references below.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-4">
        {nothing && (
          <EmptyState
            tone="amber"
            fill
            icon={<D20Die count={20} className="h-6 w-6" />}
            title="Nothing in the stacks"
            description="No entry matches that search — try a shorter fragment."
          />
        )}

        {cast.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <SectionHeading count={cast.length}>This campaign — cast & monsters</SectionHeading>
              <div className="flex items-center gap-2">
                {recharting && (
                  <span className="font-serif-body text-3xs text-amber-200/50">
                    recharting from the module…
                  </span>
                )}
                <Button
                  variant="ghost"
                  tone="amber"
                  size="xs"
                  loading={recharterPending}
                  disabled={recharting}
                  onClick={onRecharter}
                >
                  Recharter
                </Button>
              </div>
            </div>
            {recharterError && <p className="px-1 text-xs text-rose-300">{recharterError}</p>}
            <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 2xl:grid-cols-3">
              {cast.map((npc) => (
                <li key={npc.id}>
                  <DndPanel
                    as="button"
                    interactive
                    onClick={() => onOpenNpc(npc)}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <span
                      aria-hidden="true"
                      className={`font-fantasy grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-bold ring-1 ${
                        npc.category === "monster"
                          ? "bg-emerald-500/20 text-emerald-200 ring-emerald-400/50"
                          : "bg-purple-500/20 text-purple-200 ring-purple-400/50"
                      }`}
                    >
                      {npc.name[0]?.toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-fantasy block truncate text-base font-bold text-amber-100">
                        {npc.name}
                      </span>
                      <span className="block truncate text-2xs text-amber-200/60">{npc.role}</span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {npc.maxHp !== null && <StatPill tone="hp">{`${npc.maxHp} HP`}</StatPill>}
                      {npc.armorClass !== null && (
                        <StatPill tone="ac">{`AC ${npc.armorClass}`}</StatPill>
                      )}
                    </span>
                  </DndPanel>
                </li>
              ))}
            </ul>
          </section>
        )}

        {beasts.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionHeading count={beasts.length}>Bestiary</SectionHeading>
            <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-4">
              {beasts.map((m) => (
                <li
                  key={m.name}
                  className="flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-black/25 px-3 py-2"
                >
                  <span className="font-fantasy min-w-0 flex-1 truncate text-sm font-bold text-amber-100">
                    {m.name}
                  </span>
                  <StatPill tone="ac">{`AC ${m.armorClass}`}</StatPill>
                  <StatPill tone="hp">{`${m.maxHp} HP`}</StatPill>
                </li>
              ))}
            </ul>
          </section>
        )}

        {knownSpells.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionHeading count={knownSpells.length}>Spells</SectionHeading>
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
              {knownSpells.map((spell) => (
                <li
                  key={spell.name}
                  className="flex flex-col gap-1 rounded-xl border border-purple-400/15 bg-black/25 px-3 py-2.5"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-fantasy min-w-0 flex-1 truncate text-sm font-bold text-amber-100">
                      {spell.name}
                    </span>
                    <span className="shrink-0 text-3xs uppercase tracking-label text-purple-300/70">
                      {spellLevelLabel(spell.level)} · {spell.school}
                    </span>
                  </div>
                  <p className="text-3xs text-amber-200/50">
                    {spell.castingTime} · {spell.range} · {spell.duration}
                    {spell.damage ? ` · ${spell.damage}` : ""}
                  </p>
                  <p className="font-serif-body line-clamp-2 text-2xs leading-snug text-amber-200/65">
                    {spell.text}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {gear.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionHeading count={gear.length}>Items & references</SectionHeading>
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
              {gear.map((entry) => (
                <li
                  key={entry.title}
                  className="flex flex-col gap-1 rounded-xl border border-amber-400/15 bg-black/25 px-3 py-2.5"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-fantasy min-w-0 flex-1 truncate text-sm font-bold text-amber-100">
                      {entry.title}
                    </span>
                    <span className="shrink-0 text-3xs uppercase tracking-label text-amber-300/50">
                      {entry.kind}
                    </span>
                  </div>
                  <p className="font-serif-body line-clamp-3 text-2xs leading-snug text-amber-200/65">
                    {entry.text}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
