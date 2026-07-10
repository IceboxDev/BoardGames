import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button, LoadingState } from "../../../components/ui";
import { fetchActiveDndSession, setBeamerImage, triggerBeamer } from "../../../lib/dnd-campaigns";
import { errorMessageOf } from "../../../lib/error-message";
import { qk } from "../../../lib/query-keys";
import { DndPanel } from "./ui";

// External devices: the join code a beamer/TTS companion types in, and the
// image control — whatever the DM uploads here is what the beamer shows,
// fullscreen, nothing else.

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("could not read the file"));
    reader.readAsDataURL(file);
  });
}

export function DevicesScreen() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [delivered, setDelivered] = useState<number | null>(null);

  const sessionQuery = useQuery({
    queryKey: qk.dndActiveSession(),
    queryFn: fetchActiveDndSession,
  });
  const session = sessionQuery.data?.session ?? null;

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!session) throw new Error("no live session");
      if (!file.type.startsWith("image/")) throw new Error("Pick an image file.");
      if (file.size > IMAGE_MAX_BYTES) throw new Error("Image is too large (10 MB max).");
      const dataUri = await fileToDataUri(file);
      const result = await setBeamerImage(session.id, dataUri);
      return { dataUri, delivered: result.delivered };
    },
    onSuccess: ({ dataUri, delivered: count }) => {
      setPreview(dataUri);
      setDelivered(count);
      setFileError(null);
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => {
      if (!session) throw new Error("no live session");
      return triggerBeamer(session.id, { type: "clear" });
    },
    onSuccess: (result) => {
      setPreview(null);
      setDelivered(result.delivered);
    },
  });

  if (sessionQuery.isPending) {
    return <LoadingState fill label="Lighting the signal fires…" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pt-3">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <DndPanel padding="xl" className="text-center">
          <p className="font-serif-body text-3xs font-bold uppercase tracking-eyebrow text-amber-300/70">
            Join code — external devices
          </p>
          {session ? (
            <>
              <p className="font-fantasy mt-2 text-5xl font-bold tracking-eyebrow text-amber-100">
                {session.code}
              </p>
              <p className="font-serif-body mt-3 text-xs leading-relaxed text-amber-200/50">
                On the beamer device: open this game, pick “Beamer / TTS”, and enter the code. The
                screen becomes a fullscreen display of whatever you put below.
              </p>
            </>
          ) : (
            <p className="font-serif-body mt-2 text-sm text-amber-200/60">
              No live session — reopen the campaign to light one.
            </p>
          )}
        </DndPanel>

        <div className="rounded-2xl border border-amber-400/20 bg-black/25 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-serif-body text-3xs font-bold uppercase tracking-eyebrow text-amber-300/60">
              On the beamer now
            </p>
            <div className="flex items-center gap-2">
              {delivered !== null && (
                <span className="font-serif-body text-3xs text-amber-200/40">
                  delivered to {delivered} {delivered === 1 ? "screen" : "screens"}
                </span>
              )}
              <Button
                variant="tinted"
                tone="amber"
                size="xs"
                disabled={!session}
                loading={uploadMutation.isPending}
                onClick={() => fileInput.current?.click()}
              >
                {preview ? "Change image" : "Show an image"}
              </Button>
              {preview && (
                <Button
                  variant="ghost"
                  tone="rose"
                  size="xs"
                  loading={clearMutation.isPending}
                  onClick={() => clearMutation.mutate()}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) uploadMutation.mutate(file);
            }}
          />
          {(uploadMutation.isError || fileError) && (
            <p className="mt-2 text-xs text-rose-300">
              {fileError ?? errorMessageOf(uploadMutation.error, "The upload failed.")}
            </p>
          )}
          {clearMutation.isError && (
            <p className="mt-2 text-xs text-rose-300">
              {errorMessageOf(clearMutation.error, "Clearing failed.")}
            </p>
          )}
          {preview ? (
            <img
              src={preview}
              alt="Currently on the beamer"
              className="mt-3 max-h-80 w-full rounded-xl object-contain"
            />
          ) : (
            <p className="font-serif-body mt-3 py-8 text-center text-xs text-amber-200/40">
              Nothing on the beamer — connected screens show the campaign splash.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
