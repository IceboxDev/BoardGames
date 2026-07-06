import type { AbilityKey, DndNpc } from "@boardgames/core/protocol";
import { ABILITY_KEYS } from "@boardgames/core/protocol";
import { Modal } from "../../../components/ui";

// An NPC or monster card, extracted from the module's stat-block appendix
// during the campaign reading. Read-only — the module is the source of truth.

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
  npc: DndNpc;
  onClose: () => void;
};

export function NpcSheetModal({ npc, onClose }: Props) {
  return (
    <Modal
      onClose={onClose}
      eyebrow={npc.category === "monster" ? "Bestiary" : "Dramatis personae"}
      title={npc.name}
      titleClassName="font-fantasy text-3xl font-bold text-amber-100"
      subheader={
        <p className="text-base italic text-amber-200/70" style={SERIF}>
          {npc.role}
        </p>
      }
      panelClassName="max-w-2xl max-h-[92vh] overflow-y-auto border-amber-400/25"
    >
      <div className="flex flex-wrap gap-1.5">
        {npc.kind && (
          <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-3xs font-semibold uppercase tracking-[0.12em] text-amber-200/80 ring-1 ring-amber-400/25">
            {npc.kind}
          </span>
        )}
        {npc.location && (
          <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-3xs font-semibold uppercase tracking-[0.12em] text-sky-200/80 ring-1 ring-sky-400/25">
            {npc.location}
          </span>
        )}
        {npc.maxHp !== null && (
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-3xs font-bold text-rose-200 ring-1 ring-rose-400/40">
            {npc.maxHp} HP
          </span>
        )}
        {npc.armorClass !== null && (
          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-3xs font-bold text-sky-200 ring-1 ring-sky-400/40">
            AC {npc.armorClass}
          </span>
        )}
      </div>

      {npc.abilities && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ABILITY_KEYS.map((key) => {
            const score = npc.abilities?.[key];
            if (score === undefined) return null;
            return (
              <div
                key={key}
                className="flex flex-col items-center rounded-xl border border-amber-400/25 bg-[#1a0606]/70 px-2 py-2"
              >
                <span
                  className="text-4xs font-bold uppercase tracking-[0.2em] text-amber-300/70"
                  style={SERIF}
                >
                  {ABILITY_LABEL[key]}
                </span>
                <span className="font-fantasy text-xl font-bold text-amber-100">{score}</span>
                <span className="text-2xs text-amber-200/60">{fmtMod(score)}</span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-sm leading-relaxed text-amber-200/75" style={SERIF}>
        {npc.description}
      </p>

      {npc.secrets && (
        <div className="rounded-xl border border-rose-400/25 bg-rose-950/30 p-3">
          <p
            className="text-3xs font-bold uppercase tracking-[0.25em] text-rose-300/80"
            style={SERIF}
          >
            For the DM's eyes only
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-rose-100/80" style={SERIF}>
            {npc.secrets}
          </p>
        </div>
      )}
    </Modal>
  );
}
