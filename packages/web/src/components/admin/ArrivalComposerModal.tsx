import {
  type AdminArrivalPoll,
  type AdminUser,
  ARRIVAL_GAMES_MAX,
  type SkillPlayerRef,
} from "@boardgames/core/protocol";
import { type CSSProperties, useMemo, useState } from "react";
import { usePublishArrival } from "../../hooks/useAdminArrivals";
import { DEFAULT_ACCENT } from "../../lib/accent";
import { formatShortDate, parseUtcStamp } from "../../lib/date-format";
import { fileToArrivalPhoto } from "../../lib/downscale-image";
import { errorMessageOf } from "../../lib/error-message";
import { resolveGame } from "../../lib/games-by-slug";
import { dateKey } from "../../lib/offline-availability";
import { ArrivalTakeoverView } from "../arrivals/ArrivalTakeoverView";
import { UPLOAD_GUIDANCE } from "../arrivals/arrival-copy";
import type { ArrivalTotals } from "../arrivals/arrival-view-model";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CheckRow } from "../ui/CheckRow";
import { Chip } from "../ui/Chip";
import { ErrorAlert } from "../ui/ErrorAlert";
import { FieldGroup } from "../ui/Field";
import { Input } from "../ui/Input";
import { Modal, ModalBody, ModalFooter } from "../ui/Modal";
import { Surface } from "../ui/Surface";
import { useConfirm } from "../ui/useConfirm";
import { ArrivalPhotoField } from "./ArrivalPhotoField";
import {
  type DraftGame,
  draftToBody,
  draftToCards,
  firstUnmetRequirement,
  newDraftGame,
  readySummary,
} from "./arrival-draft";
import { PurchaserPicker } from "./PurchaserPicker";
import { VoterStack } from "./TallyRows";

// The admin composes an arrival on one screen: which closed vote, which of
// its games showed up (1–3, winner preselected), who bought each, and a
// photo of each. "Preview popup" swaps this modal for the real takeover over
// the draft — the composer stays mounted underneath, so nothing is lost —
// and Publish sends the whole thing in one request.

export { firstUnmetRequirement, isDraftValid } from "./arrival-draft";

type Props = {
  /** Closed polls, newest first (the composer defaults to the first). */
  polls: AdminArrivalPoll[];
  /** Name/image for every voter id in the tallies. */
  players: Record<string, SkillPlayerRef>;
  /** Members eligible to be named as a purchaser. */
  members: AdminUser[];
  viewerId: string | null;
  onClose: () => void;
  onPublished: (arrivalId: string) => void;
};

function titleOf(slug: string): string {
  return resolveGame(slug)?.title ?? slug;
}

function shortDate(stamp: string): string {
  return formatShortDate(parseUtcStamp(stamp)?.toISOString() ?? stamp);
}

function initialGames(poll: AdminArrivalPoll | undefined): DraftGame[] {
  return poll?.winnerSlug ? [newDraftGame(poll.winnerSlug, null)] : [];
}

export function ArrivalComposerModal({
  polls,
  players,
  members,
  viewerId,
  onClose,
  onPublished,
}: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const publishMutation = usePublishArrival();
  const [pollId, setPollId] = useState<number | null>(polls[0]?.id ?? null);
  const poll = polls.find((p) => p.id === pollId) ?? polls[0];
  const [games, setGames] = useState<DraftGame[]>(() => initialGames(polls[0]));
  const [lastPurchaserId, setLastPurchaserId] = useState<string | null>(null);
  // The day the boxes arrived: stamped as each copy's acquisition date, which
  // is what makes it read as New in the purchaser's library. Today by default —
  // arrivals are usually composed the day the parcel lands.
  const [acquiredOn, setAcquiredOn] = useState(() => dateKey(new Date()));
  const [previewOpen, setPreviewOpen] = useState(false);

  const voterById = useMemo(
    () => new Map(Object.entries(players).map(([id, p]) => [id, { name: p.name, image: p.image }])),
    [players],
  );

  if (!poll) return null;

  const hasPhotos = games.some((g) => g.photo !== null || g.photoStatus === "processing");
  const unmet = firstUnmetRequirement(games, titleOf, acquiredOn);
  const valid = unmet === null;
  const announced = new Set(poll.arrivedSlugs);

  const patchGame = (slug: string, patch: (game: DraftGame) => DraftGame) =>
    setGames((prev) => prev.map((g) => (g.slug === slug ? patch(g) : g)));

  const toggleGame = (slug: string) => {
    setGames((prev) => {
      if (prev.some((g) => g.slug === slug)) return prev.filter((g) => g.slug !== slug);
      if (prev.length >= ARRIVAL_GAMES_MAX) return prev;
      return [...prev, newDraftGame(slug, lastPurchaserId)];
    });
  };

  const setPurchaser = (slug: string, userId: string) => {
    setLastPurchaserId(userId);
    patchGame(slug, (g) => ({ ...g, purchaserUserId: userId }));
  };

  const attachPhoto = async (slug: string, file: File) => {
    patchGame(slug, (g) => ({ ...g, photoStatus: "processing", photoError: null }));
    try {
      const image = await fileToArrivalPhoto(file);
      patchGame(slug, (g) => ({
        ...g,
        photo: { ...image, landscape: image.width > image.height, fileName: file.name },
        photoStatus: "idle",
        photoError: null,
      }));
    } catch (err) {
      patchGame(slug, (g) => ({
        ...g,
        photo: null,
        photoStatus: "error",
        photoError: errorMessageOf(err, "Couldn't prepare that photo"),
      }));
    }
  };

  const switchPoll = async (next: AdminArrivalPoll) => {
    if (next.id === poll.id) return;
    if (hasPhotos) {
      const ok = await confirm({
        title: "Switch vote?",
        description: "Your picks and photos for this announcement are cleared.",
        confirmLabel: "Switch",
        variant: "danger",
      });
      if (!ok) return;
    }
    setPollId(next.id);
    setGames(initialGames(next));
  };

  const requestClose = async () => {
    if (hasPhotos) {
      const ok = await confirm({
        title: "Discard this announcement?",
        description: "Prepared photos are dropped.",
        confirmLabel: "Discard",
        variant: "danger",
      });
      if (!ok) return;
    }
    onClose();
  };

  const publish = () => {
    const body = draftToBody(poll.id, games, acquiredOn);
    if (!body) return;
    publishMutation.mutate(body, { onSuccess: (res) => onPublished(res.arrivalId) });
  };

  if (previewOpen) {
    const cards = draftToCards(games, poll, players, members);
    const totals: ArrivalTotals = {
      voterCount: poll.voterCount,
      votesCast: poll.tally.reduce((sum, t) => sum + t.votes, 0),
    };
    if (cards) {
      const back = () => setPreviewOpen(false);
      return (
        <ArrivalTakeoverView
          cards={cards}
          totals={totals}
          viewerId={viewerId}
          onDismiss={back}
          onCta={back}
          switcher={
            <p className="text-center text-3xs font-semibold uppercase tracking-pill text-fg-muted">
              Admin preview — nothing is sent
            </p>
          }
        />
      );
    }
  }

  const publishError = errorMessageOf(publishMutation.error, "Couldn't publish — try again.");
  const footerStart = publishError ? (
    <ErrorAlert message={publishError} />
  ) : (
    <span data-testid="arrival-draft-status" className="text-xs text-fg-muted">
      {unmet ?? readySummary(games)}
    </span>
  );

  return (
    <>
      <Modal
        onClose={() => void requestClose()}
        size="lg"
        eyebrow="Arrivals"
        title="Announce an arrival"
        subheader={
          <p className="text-xs text-fg-secondary">
            Pick the games that showed up, who bought them, and a photo of each. Members see it
            once, as a popup.
          </p>
        }
        closeOnBackdrop={false}
      >
        <ModalBody gap="md">
          <FieldGroup label="Vote">
            <div className="flex flex-wrap gap-1.5">
              {polls.map((p) => (
                <Chip
                  key={p.id}
                  pressed={p.id === poll.id}
                  shape="pill"
                  size="sm"
                  variant="outlined"
                  disabled={polls.length === 1}
                  title={`${p.candidates.length} candidates`}
                  onClick={() => void switchPoll(p)}
                >
                  Closed {shortDate(p.closedAt)} ·{" "}
                  {p.winnerSlug ? titleOf(p.winnerSlug) : "nobody voted"}
                </Chip>
              ))}
            </div>
          </FieldGroup>

          <FieldGroup
            label="Arrived on"
            hint="Becomes each copy's acquisition date — it reads as New until its owner plays it"
          >
            <Input
              type="date"
              aria-label="Arrived on"
              value={acquiredOn}
              onChange={(e) => setAcquiredOn(e.target.value)}
              className="max-w-48"
            />
          </FieldGroup>

          <FieldGroup label="Games" hint={`1–${ARRIVAL_GAMES_MAX} games · sorted by votes`}>
            <ul className="space-y-1">
              {poll.tally.map((entry) => {
                const picked = games.some((g) => g.slug === entry.slug);
                const full = !picked && games.length >= ARRIVAL_GAMES_MAX;
                const title = titleOf(entry.slug);
                const thumb = resolveGame(entry.slug)?.thumbnail;
                return (
                  <li key={entry.slug}>
                    <CheckRow
                      padding="sm"
                      checked={picked}
                      disabled={full}
                      onChange={() => toggleGame(entry.slug)}
                      aria-label={
                        full
                          ? `${title} — up to ${ARRIVAL_GAMES_MAX} games per announcement`
                          : title
                      }
                      leading={
                        thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            className="h-7 w-12 shrink-0 rounded object-cover"
                          />
                        ) : undefined
                      }
                      title={
                        <span className="flex items-center gap-1.5">
                          <span className="truncate">{title}</span>
                          {poll.winnerSlug === entry.slug && (
                            <Badge tone="amber" size="xs">
                              Winner
                            </Badge>
                          )}
                          {announced.has(entry.slug) && (
                            <Badge tone="neutral" size="xs">
                              Announced
                            </Badge>
                          )}
                        </span>
                      }
                      description={`${entry.votes} vote${entry.votes === 1 ? "" : "s"}`}
                      trailing={<VoterStack voterIds={entry.voterIds} voterById={voterById} />}
                    />
                  </li>
                );
              })}
            </ul>
          </FieldGroup>

          {games.map((game) => {
            const title = titleOf(game.slug);
            const def = resolveGame(game.slug);
            return (
              <div
                key={game.slug}
                style={{ "--accent": def?.accentHex ?? DEFAULT_ACCENT } as CSSProperties}
              >
                <Surface variant="tile" padding="none" className="space-y-3 p-3">
                  <div className="flex items-center gap-2.5">
                    {def && (
                      <img
                        src={def.thumbnail}
                        alt=""
                        className="h-7 w-12 shrink-0 rounded object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg-strong">
                      {title}
                    </span>
                    <Button variant="ghost" size="xs" onClick={() => toggleGame(game.slug)}>
                      Remove game
                    </Button>
                  </div>
                  <FieldGroup label="Bought by">
                    <PurchaserPicker
                      members={members}
                      value={game.purchaserUserId}
                      onChange={(id) => setPurchaser(game.slug, id)}
                      searchLabel={`Search members for ${title}`}
                    />
                  </FieldGroup>
                  <FieldGroup label="Photo" hint={UPLOAD_GUIDANCE}>
                    <ArrivalPhotoField
                      gameTitle={title}
                      photo={game.photo}
                      status={game.photoStatus}
                      error={game.photoError}
                      onFile={(file) => void attachPhoto(game.slug, file)}
                      onRemove={() =>
                        patchGame(game.slug, (g) => ({
                          ...g,
                          photo: null,
                          photoStatus: "idle",
                          photoError: null,
                        }))
                      }
                    />
                  </FieldGroup>
                </Surface>
              </div>
            );
          })}
        </ModalBody>

        <ModalFooter start={footerStart}>
          <Button
            variant="secondary"
            size="sm"
            disabled={!valid}
            onClick={() => setPreviewOpen(true)}
          >
            Preview popup
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void requestClose()}>
            Cancel
          </Button>
          <Button size="sm" disabled={!valid} loading={publishMutation.isPending} onClick={publish}>
            Publish
          </Button>
        </ModalFooter>
      </Modal>
      {confirmDialog}
    </>
  );
}
