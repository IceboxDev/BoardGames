import type { CampaignPartner } from "@boardgames/core/protocol";
import { useId, useState } from "react";
import {
  Button,
  ErrorAlert,
  Field,
  Input,
  LoadingState,
  MemberPicker,
  Modal,
  ModalBody,
  ModalFooter,
  SegmentedControl,
} from "../../../components/ui";
import { errorMessageOf } from "../../../lib/error-message";
import { useCreateCampaign, usePartnerCandidates } from "./api";

// Starting a campaign: its name and the partner — shared by the campaign lists
// and a Duet room's lobby (`DuetLobbyConfig`).

type PartnerKind = CampaignPartner["kind"];

const KIND_LABEL: Record<PartnerKind, string> = {
  member: "A member",
  ai: "AI partner",
  guest: "Someone else",
};

/** Starts a campaign in Prague; `kinds` = the partners this entry point offers. */
export function NewCampaignModal({
  kinds,
  onClose,
  onCreated,
}: {
  kinds: readonly PartnerKind[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const create = useCreateCampaign();
  const uid = useId();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PartnerKind>(kinds[0] ?? "member");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const members = usePartnerCandidates(kind === "member");

  const partner: CampaignPartner | null =
    kind === "ai"
      ? { kind: "ai" }
      : kind === "guest"
        ? guestName.trim()
          ? { kind: "guest", name: guestName.trim() }
          : null
        : memberId
          ? { kind: "member", userId: memberId }
          : null;
  const ready = name.trim().length > 0 && partner !== null;

  return (
    <Modal onClose={onClose} size="sm" eyebrow="Codenames: Duet" title="New campaign">
      <ModalBody gap="md">
        <Field label="Team name" htmlFor={`${uid}-name`} hint="Written in the TEAM box of the map">
          <Input
            id={`${uid}-name`}
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Night Owls"
          />
        </Field>
        <div className="flex flex-col gap-2">
          {kinds.length > 1 && (
            <>
              <span className="text-sm font-semibold text-fg-primary">Partner</span>
              <SegmentedControl
                fullWidth
                value={kind}
                onChange={setKind}
                options={kinds.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              />
            </>
          )}
          {kind === "member" &&
            (members.isPending ? (
              <LoadingState label="Loading members…" className="py-6" />
            ) : (
              <MemberPicker
                members={(members.data ?? []).map((m) => ({
                  id: m.userId,
                  name: m.name,
                  image: m.image,
                }))}
                selectedIds={new Set(memberId ? [memberId] : [])}
                onToggle={(id) => setMemberId((current) => (current === id ? null : id))}
                selectedNoun="partner"
              />
            ))}
          {kind === "ai" && (
            <p className="text-sm text-fg-secondary">
              The AI partner holds the other side of the key and gives you clues. Pick its strength
              before each mission.
            </p>
          )}
          {kind === "guest" && (
            <Field
              label="Their name"
              htmlFor={`${uid}-guest`}
              hint="For a partner without an account: you play with the real cards and track it here"
            >
              <Input
                id={`${uid}-guest`}
                maxLength={40}
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
            </Field>
          )}
        </div>
        {create.isError && (
          <ErrorAlert message={errorMessageOf(create.error, "Couldn't start the campaign") ?? ""} />
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!ready || create.isPending}
          onClick={() =>
            partner &&
            create.mutate(
              { name: name.trim(), partner },
              { onSuccess: ({ campaign }) => onCreated(campaign.id) },
            )
          }
        >
          {create.isPending ? "Starting…" : "Start in Prague"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
