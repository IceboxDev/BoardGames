/**
 * The bottom of the folder rail: one slim row — your lichess account (or a
 * Connect button), a status dot, and a gear that opens everything else in a
 * dialog: the account and pulling new games, how the tree build stands, and
 * the analysis farm's queue.
 */
import type { LichessLink } from "@boardgames/core/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { GearIcon } from "../../../../components/icons";
import {
  Button,
  ErrorAlert,
  IconButton,
  MicroLabel,
  Modal,
  ModalBody,
  ModalFooter,
  ProgressBar,
  StatTile,
} from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { chessKeys, unlinkAccount } from "../api";
import { forgetLichessToken, startLichessLogin } from "../lichess/oauth";
import type { ImportState } from "../useLichessImport";
import type { TreeBuild } from "../useTreeBuild";
import { buildLabel, farmText } from "./status-text";

interface Props {
  readonly link: LichessLink | null;
  readonly token: string | null;
  readonly importer: ImportState;
  readonly builds: Record<"w" | "b", TreeBuild | null>;
}

export function ConnectionBar({ link, token, importer, builds }: Props) {
  const [open, setOpen] = useState(false);

  if (!link) {
    return (
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <p className="text-xs text-fg-muted">
          Your trees grow from every game you've played on lichess.
        </p>
        <Button size="sm" onClick={() => void startLichessLogin()}>
          Connect lichess
        </Button>
      </div>
    );
  }

  const busy = importer.running || builds.w?.phase !== "idle" || builds.b?.phase !== "idle";
  const dot = !token ? "bg-amber-400" : busy ? "bg-sky-400 animate-pulse" : "bg-emerald-400";
  const dotTitle = !token
    ? "lichess isn't connected in this browser"
    : importer.running
      ? "Pulling new games"
      : busy
        ? "Building your trees"
        : "Connected";

  return (
    <>
      <div className="flex items-center gap-2.5 border-t border-line pt-3">
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-fill-strong font-bold text-fg-strong uppercase">
          {link.username.slice(0, 1)}
          <span
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-surface-900",
              dot,
            )}
            title={dotTitle}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg-strong">
            {link.username}
          </span>
          <span className="block truncate text-2xs text-fg-muted">
            {importer.running ? "Pulling new games…" : `${link.gamesCount.toLocaleString()} games`}
          </span>
        </span>
        {!token ? (
          <Button size="xs" onClick={() => void startLichessLogin()}>
            Reconnect
          </Button>
        ) : (
          <IconButton
            size="sm"
            aria-label="lichess and analysis settings"
            title="lichess, games and analysis"
            icon={<GearIcon className="size-4" />}
            onClick={() => setOpen(true)}
          />
        )}
      </div>
      {importer.running && (
        <ProgressBar
          label="Import progress"
          value={
            importer.total
              ? Math.min(
                  1,
                  (importer.storedBefore + (importer.progress?.seen ?? 0)) / importer.total,
                )
              : 0
          }
          animate
        />
      )}
      {open && (
        <ConnectionDialog
          link={link}
          importer={importer}
          builds={builds}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ConnectionDialog({
  link,
  importer,
  builds,
  onClose,
}: {
  link: LichessLink;
  importer: ImportState;
  builds: Record<"w" | "b", TreeBuild | null>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const unlink = useMutation({
    mutationFn: unlinkAccount,
    onSuccess: (res) => {
      forgetLichessToken();
      queryClient.setQueryData(chessKeys.link, res);
      onClose();
    },
  });
  const p = importer.progress;
  const seen = p?.seen ?? 0;
  const farm = farmText(builds.w?.farm ?? builds.b?.farm ?? null);

  return (
    <Modal onClose={onClose} size="md" eyebrow="Opening trainer" title="lichess & analysis">
      <ModalBody gap="md">
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <a
              href={`https://lichess.org/@/${link.username}`}
              target="_blank"
              rel="noreferrer"
              className="text-lg font-bold text-fg-strong hover:underline"
            >
              {link.username}
            </a>
            {importer.running ? (
              <Button size="sm" variant="secondary" onClick={importer.stop}>
                Pause import
              </Button>
            ) : (
              <Button size="sm" onClick={() => importer.start(link)}>
                Pull new games
              </Button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatTile size="sm" label="Games" value={link.gamesCount.toLocaleString()} />
            <StatTile size="sm" label="As White" value={link.byColor.w.toLocaleString()} />
            <StatTile size="sm" label="As Black" value={link.byColor.b.toLocaleString()} />
          </div>
          <p className="text-xs text-fg-muted">
            Newest game {link.newestGameAt ? new Date(link.newestGameAt).toLocaleDateString() : "—"}
            .
          </p>
          {(importer.running || p) && (
            <div className="flex flex-col gap-1.5">
              <ProgressBar
                label="Import progress"
                value={
                  importer.finished
                    ? 1
                    : importer.total
                      ? Math.min(1, (importer.storedBefore + seen) / importer.total)
                      : 0
                }
                animate={importer.running}
              />
              <p className="text-xs text-fg-secondary">
                {importer.running
                  ? "Importing… "
                  : importer.finished
                    ? "Up to date. "
                    : importer.error
                      ? "Import stopped. "
                      : "Import paused. "}
                {importer.stored.toLocaleString()} new games saved.
              </p>
            </div>
          )}
          {importer.error && <ErrorAlert message={importer.error} />}
        </section>

        <section className="flex flex-col gap-2">
          <MicroLabel>Your trees</MicroLabel>
          {(["w", "b"] as const).map((c) => {
            const b = builds[c];
            return (
              <div key={c} className="flex items-center gap-2 text-sm">
                <span className="w-16 shrink-0 text-fg-muted">
                  {c === "w" ? "♔ White" : "♚ Black"}
                </span>
                <span className="min-w-0 flex-1 truncate text-fg-secondary">
                  {b
                    ? buildLabel(b) ||
                      `Built · ${Object.keys(b.tree?.nodes ?? {}).length.toLocaleString()} positions`
                    : "Not created yet"}
                </span>
                {b &&
                  (b.phase !== "idle" ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={b.stop}
                      disabled={b.phase !== "building"}
                    >
                      Pause
                    </Button>
                  ) : (
                    <Button size="xs" variant="ghost" onClick={() => b.build()}>
                      Rebuild
                    </Button>
                  ))}
              </div>
            );
          })}
        </section>

        <section className="flex flex-col gap-1">
          <MicroLabel>Analysis farm</MicroLabel>
          <p className="text-sm text-fg-secondary">
            {farm ?? "Nothing waiting: every position your trees asked for is analysed."}
          </p>
        </section>
        {unlink.isError && <ErrorAlert message="Couldn't disconnect. Try again." />}
      </ModalBody>
      <ModalFooter
        start={
          <Button
            size="sm"
            variant="ghost"
            loading={unlink.isPending}
            disabled={importer.running}
            onClick={() => unlink.mutate()}
          >
            Disconnect lichess
          </Button>
        }
      >
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      </ModalFooter>
    </Modal>
  );
}
