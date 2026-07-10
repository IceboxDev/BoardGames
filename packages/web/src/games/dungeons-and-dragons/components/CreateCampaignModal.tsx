import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Modal } from "../../../components/ui";
import { createCampaign, fileToPdfDataUri, pdfValidationError } from "../../../lib/dnd-campaigns";
import { errorMessageOf } from "../../../lib/error-message";
import { qk } from "../../../lib/query-keys";
import { PdfDropField } from "./PdfDropField";

// "Present your tome": pick or drop an adventure-module PDF, send it to the
// sages. The POST returns as soon as the campaign row exists (status
// processing); the hall's list poll takes it from there, so the modal closes
// on success rather than baby-sitting the job.

type Props = {
  onClose: () => void;
};

export function CreateCampaignModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: async (pdf: File) => {
      const dataUri = await fileToPdfDataUri(pdf);
      return createCampaign({ pdf: dataUri, filename: pdf.name.slice(0, 200) });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.dndCampaigns() });
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
      eyebrow="New campaign"
      title="Present Your Tome"
      titleClassName="font-fantasy text-2xl font-bold text-amber-100"
      size="sm"
      panelClassName="border-amber-400/25"
    >
      <PdfDropField
        file={file}
        onFileSelected={takeFile}
        emptyTitle="Drop your adventure module here"
        emptyHint="or click to browse — PDF only, up to 20 MB"
      />

      <p className="text-2xs leading-relaxed text-fg-muted">
        The sages will read the module and chart its significant waypoints — chapters, set-piece
        battles, revelations, and the finale. The reading takes a few minutes; the PDF itself is not
        kept.
      </p>

      {(fileError || submitMutation.isError) && (
        <p className="text-xs text-rose-300">
          {fileError ??
            errorMessageOf(submitMutation.error, "The sages could not accept the tome.")}
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
          Send to the sages
        </Button>
      </div>
    </Modal>
  );
}
