import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import {
  CHARACTER_SHEET_ORDER,
  CHARACTERS,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { type ReactNode, useId, useState } from "react";
import { Button, Select } from "../../../../components/ui";
import { useHandOver } from "../privacy-context";
import { CharacterIcon, CharacterTag } from "./CharacterIcon";
import { HandedOver } from "./HandedOver";
import { StepDone } from "./Hint";

// "Show the token" — a big token with its name, for the info steps where the
// Storyteller holds a character token up (Ravenkeeper, Undertaker, the
// Grandmother's grandchild). `lead` is the line above; children go below
// (misregistration hints, void warnings). With `record`, a picker lets the
// Storyteller book which token they actually showed (defaulting to the true one).
export function TokenReveal({
  lead,
  character,
  record,
  children,
}: {
  lead: ReactNode;
  character: CharacterId;
  record?: { told?: string; onRecord: (shown: CharacterId) => void };
  children?: ReactNode;
}) {
  const [shown, setShown] = useState<CharacterId>(character);
  const fieldId = useId();
  const handOver = useHandOver();
  if (handOver) return <HandedOver />;
  return (
    <div className="flex flex-col items-center gap-1 py-1 text-center">
      <p className="text-sm text-fg-secondary">{lead}</p>
      <CharacterIcon character={character} size="xl" />
      <p className="text-2xl font-bold">
        <CharacterTag character={character} />
      </p>
      {children}
      {record && (
        <div className="mt-1 flex items-center gap-2">
          <Select
            id={`${fieldId}-shown`}
            aria-label="Token actually shown"
            block={false}
            size="sm"
            value={shown}
            onChange={(e) => setShown(e.target.value as CharacterId)}
          >
            {CHARACTER_SHEET_ORDER.map((id) => (
              <option key={id} value={id}>
                {CHARACTERS[id].name}
                {id === character ? " (true)" : ""}
              </option>
            ))}
          </Select>
          <Button variant="primary" size="sm" onClick={() => record.onRecord(shown)}>
            Record shown
          </Button>
        </div>
      )}
      {record?.told && <StepDone>Recorded — showed {record.told}.</StepDone>}
    </div>
  );
}
