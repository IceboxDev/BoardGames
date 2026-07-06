import { type DragEvent, useState } from "react";
import { BookIcon } from "../../../components/icons";

// Shared "present a tome" PDF picker: dashed amber drop zone + hidden file
// input, used by both the campaign and character upload modals. Validation
// stays with the caller (`pdfValidationError`) — this only surfaces the file.

type Props = {
  file: File | null;
  onFileSelected: (candidate: File | undefined) => void;
  emptyTitle: string;
  emptyHint: string;
};

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function PdfDropField({ file, onFileSelected, emptyTitle, emptyHint }: Props) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    onFileSelected(e.dataTransfer.files[0]);
  };

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed px-4 py-8 text-center transition ${
        dragging
          ? "border-amber-300/80 bg-amber-400/10"
          : "border-amber-400/30 bg-[#1a0606]/60 hover:border-amber-300/60 hover:bg-amber-400/[0.06]"
      }`}
    >
      <input
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(e) => onFileSelected(e.target.files?.[0])}
      />
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/40">
        <BookIcon className="h-6 w-6" />
      </span>
      {file ? (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-amber-100">{file.name}</span>
          <span className="mt-0.5 block text-2xs text-amber-200/60">
            {formatSize(file.size)} — choose another to swap
          </span>
        </span>
      ) : (
        <span>
          <span className="block text-sm font-semibold text-amber-100">{emptyTitle}</span>
          <span className="mt-0.5 block text-2xs text-amber-200/60">{emptyHint}</span>
        </span>
      )}
    </label>
  );
}
