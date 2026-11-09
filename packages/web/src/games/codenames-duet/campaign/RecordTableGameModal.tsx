import type { CityId } from "@boardgames/core/games/codenames-duet/campaign/map";
import { missionConfig } from "@boardgames/core/games/codenames-duet/campaign/map";
import type { CampaignDetail } from "@boardgames/core/protocol";
import { useId, useState } from "react";
import {
  Button,
  ErrorAlert,
  Field,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  SegmentedControl,
} from "../../../components/ui";
import { errorMessageOf } from "../../../lib/error-message";
import { newTableGameId, useRecordTableGame } from "./api";
import { cityName, missionNumbers, missionRule } from "./mission-copy";

// A mission played with the physical game: the app only keeps the result.
// Agents found and turns left are optional — the campaign needs only won/lost.

export function RecordTableGameModal({
  campaign,
  city,
  onClose,
  onRecorded,
}: {
  campaign: CampaignDetail;
  city: CityId;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const record = useRecordTableGame(campaign.id);
  const uid = useId();
  // One id per opened form: a retried or double-tapped save records it once.
  const [clientId] = useState(newTableGameId);
  const [won, setWon] = useState<"won" | "lost" | null>(null);
  const [agents, setAgents] = useState("");
  const [turnsLeft, setTurnsLeft] = useState("");
  const [note, setNote] = useState("");
  const tokens = missionConfig(city).timerTokens;

  const agentsNum = agents === "" ? undefined : Number(agents);
  const turnsNum = turnsLeft === "" ? undefined : Number(turnsLeft);
  const agentsBad =
    agentsNum !== undefined && !(Number.isInteger(agentsNum) && agentsNum >= 0 && agentsNum <= 15);
  const turnsBad =
    turnsNum !== undefined && !(Number.isInteger(turnsNum) && turnsNum >= 0 && turnsNum <= tokens);

  const save = () => {
    if (won === null || agentsBad || turnsBad) return;
    record.mutate(
      {
        clientId,
        city,
        won: won === "won",
        ...(won === "won"
          ? { agentsFound: 15 }
          : agentsNum !== undefined
            ? { agentsFound: agentsNum }
            : {}),
        ...(turnsNum !== undefined ? { tokensLeft: turnsNum } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      { onSuccess: onRecorded },
    );
  };

  return (
    <Modal
      onClose={onClose}
      size="xs"
      eyebrow="Played at the table"
      title={`${cityName(city)} ${missionNumbers(city)}`}
      subheader={<p className="text-sm text-fg-secondary">{missionRule(city)}</p>}
    >
      <ModalBody gap="md">
        <SegmentedControl
          fullWidth
          value={won}
          onChange={setWon}
          options={[
            { value: "won", label: "Mission complete", tone: "emerald" },
            { value: "lost", label: "Mission failed", tone: "rose" },
          ]}
        />
        {won === "lost" && (
          <Field
            label="Agents found"
            htmlFor={`${uid}-agents`}
            hint="Optional, out of 15"
            error={agentsBad ? "A number from 0 to 15" : undefined}
          >
            <Input
              id={`${uid}-agents`}
              inputMode="numeric"
              value={agents}
              invalid={agentsBad}
              onChange={(e) => setAgents(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        )}
        {won === "won" && (
          <Field
            label="Turns left"
            htmlFor={`${uid}-turns`}
            hint={`Optional, out of ${tokens}`}
            error={turnsBad ? `A number from 0 to ${tokens}` : undefined}
          >
            <Input
              id={`${uid}-turns`}
              inputMode="numeric"
              value={turnsLeft}
              invalid={turnsBad}
              onChange={(e) => setTurnsLeft(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        )}
        <Field
          label="Note"
          htmlFor={`${uid}-note`}
          hint="Optional — the clue that won it, what went wrong"
        >
          <Input
            id={`${uid}-note`}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {record.isError && (
          <ErrorAlert
            message={
              errorMessageOf(record.error, "Couldn't save the game — try again") ??
              "Couldn't save the game — try again"
            }
          />
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={won === null || agentsBad || turnsBad || record.isPending}>
          {record.isPending ? "Saving…" : "Record game"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
