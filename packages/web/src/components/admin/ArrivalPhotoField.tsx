import { type ChangeEvent, type DragEvent, useRef } from "react";
import { formatBytes } from "../../lib/format-bytes";
import { CameraIcon } from "../icons";
import { Button } from "../ui/Button";
import { ErrorAlert } from "../ui/ErrorAlert";
import { LoadingState } from "../ui/LoadingState";
import { Surface } from "../ui/Surface";
import type { DraftPhoto, DraftPhotoStatus } from "./arrival-draft";

// One game's real-world photo: a dropzone until a file is picked, a spinner
// while the browser downscales it, then the 4:5 crop members will see (the
// same centre crop the server bakes) with size, an orientation warning, and
// Replace / Remove. Owns no async work — the composer runs the downscale so
// tests can mock one seam.

const ACCEPT = "image/png,image/jpeg,image/webp";

type Props = {
  gameTitle: string;
  photo: DraftPhoto | null;
  status: DraftPhotoStatus;
  error: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
};

export function ArrivalPhotoField({ gameTitle, photo, status, error, onFile, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputLabel = `Photo of ${gameTitle}`;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so re-picking the same file fires again after a Remove.
    e.target.value = "";
    if (file) onFile(file);
  };
  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  if (status === "processing") {
    return (
      <Surface variant="tile" padding="sm">
        <LoadingState label="Preparing photo…" />
      </Surface>
    );
  }

  if (photo) {
    return (
      <div className="flex gap-3">
        <img
          src={photo.dataUri}
          alt={inputLabel}
          className="aspect-photo w-32 shrink-0 rounded-card-lg object-cover object-center ring-2 ring-[var(--accent)]/60"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-2xs text-fg-muted">
            {photo.width}×{photo.height} · {formatBytes(photo.bytes)}
          </span>
          {photo.landscape && (
            <p className="text-xs text-amber-300">
              This photo is landscape — it will be cropped to portrait; a portrait shot works best.
            </p>
          )}
          <div className="mt-auto flex flex-wrap gap-1.5">
            <Button variant="secondary" size="xs" onClick={() => inputRef.current?.click()}>
              Replace
            </Button>
            <Button variant="ghost" size="xs" onClick={onRemove}>
              Remove
            </Button>
          </div>
          {/* biome-ignore lint/correctness/noRestrictedElements: sr-only file input reached through the Replace button — no visible chrome to drift */}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            aria-label={inputLabel}
            onChange={handleChange}
            className="sr-only"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="flex cursor-pointer items-center gap-3 rounded-card-lg border border-dashed border-line-strong bg-surface-900/60 p-3 transition hover:border-accent-400/40"
      >
        {/* biome-ignore lint/correctness/noRestrictedElements: sr-only file input behind the styled dropzone — no visible chrome to drift */}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          aria-label={inputLabel}
          onChange={handleChange}
          className="sr-only"
        />
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card-md bg-surface-800 text-fg-muted">
          <CameraIcon />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm text-fg-secondary">Click or drop a photo</span>
          <span className="text-2xs text-fg-muted">PNG, JPEG or WebP</span>
        </span>
      </label>
      {error && <ErrorAlert message={error} />}
    </div>
  );
}
