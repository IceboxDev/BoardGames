import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Modal } from "../../../components/ui";
import { createCharacter, fileToPdfDataUri, pdfValidationError } from "../../../lib/dnd-campaigns";
import { errorMessageOf } from "../../../lib/error-message";
import { qk } from "../../../lib/query-keys";
import { PdfDropField } from "./PdfDropField";

// "Recruit an adventurer": drop a player's character-sheet PDF; the scribes
// extract the internal representation shown in the party roster. Same
// close-on-accept contract as the campaign modal — the setup screen's poll
// carries the processing state.

type Props = {
  campaignId: string;
  partyId: string;
  onClose: () => void;
};

export function CreateCharacterModal({ campaignId, partyId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: async (pdf: File) => {
      const dataUri = await fileToPdfDataUri(pdf);
      return createCharacter(campaignId, {
        pdf: dataUri,
        filename: pdf.name.slice(0, 200),
        partyId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.dndCharacters(partyId) });
      void queryClient.invalidateQueries({ queryKey: qk.dndFiles() });
      onClose();
    },
  });

  const takeFile = (candidate: File | undefined) => {
    if (!candidate) return;
    const error = pdfValidationError(candidate);
    setFileError(error);
    setFile(error ? null : candidate);
  };

  return (
    <Modal
      onClose={onClose}
      eyebrow="Recruit an adventurer"
      title="Present a Character Sheet"
      titleClassName="font-fantasy text-2xl font-bold text-amber-100"
      size="sm"
      panelClassName="border-amber-400/25"
    >
      <PdfDropField
        file={file}
        onFileSelected={takeFile}
        emptyTitle="Drop a character sheet here"
        emptyHint="or click to browse — PDF only, backstory pages welcome"
      />

      <p className="text-2xs leading-relaxed text-fg-muted">
        The scribes will copy the sheet into the party ledger — abilities, gear, spells, and a
        summary of who this adventurer is. You'll view the ledger entry, never the PDF.
      </p>

      {(fileError || submitMutation.isError) && (
        <p className="text-xs text-rose-300">
          {fileError ??
            errorMessageOf(submitMutation.error, "The scribes could not accept the sheet.")}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={submitMutation.isPending}>
          Not yet
        </Button>
        <Button
          variant="tinted"
          tone="amber"
          disabled={!file}
          loading={submitMutation.isPending}
          onClick={() => file && submitMutation.mutate(file)}
        >
          Send to the scribes
        </Button>
      </div>
    </Modal>
  );
}
