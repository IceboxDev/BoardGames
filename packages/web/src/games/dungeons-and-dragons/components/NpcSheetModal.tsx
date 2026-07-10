import type { DndNpc } from "@boardgames/core/protocol";
import { Badge, Modal, ModalBody } from "../../../components/ui";
import { AbilityGrid, SectionEyebrow, StatPill } from "./ui";

// An NPC or monster card, extracted from the module's stat-block appendix
// during the campaign reading. Read-only — the module is the source of truth.

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
      subheader={<p className="font-serif-body text-base italic text-amber-200/70">{npc.role}</p>}
      size="lg"
      panelClassName="border-amber-400/25"
    >
      <ModalBody gap="md">
        <div className="flex flex-wrap gap-1.5">
          {npc.kind && (
            <Badge tone="amber" shape="pill" size="xs" ring>
              {npc.kind}
            </Badge>
          )}
          {npc.location && (
            <Badge tone="sky" shape="pill" size="xs" ring>
              {npc.location}
            </Badge>
          )}
          {npc.maxHp !== null && <StatPill tone="hp">{npc.maxHp} HP</StatPill>}
          {npc.armorClass !== null && <StatPill tone="ac">AC {npc.armorClass}</StatPill>}
        </div>

        {npc.abilities && <AbilityGrid abilities={npc.abilities} />}

        <p className="font-serif-body text-sm leading-relaxed text-amber-200/75">
          {npc.description}
        </p>

        {npc.secrets && (
          <div className="rounded-xl border border-rose-400/25 bg-rose-950/30 p-3">
            <SectionEyebrow tone="rose">For the DM's eyes only</SectionEyebrow>
            <p className="font-serif-body mt-1.5 text-sm leading-relaxed text-rose-100/80">
              {npc.secrets}
            </p>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
