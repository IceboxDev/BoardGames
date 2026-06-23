import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { familyOf } from "../../games/families.ts";
import type { GameDefinition } from "../../games/types.ts";
import { compactSummary } from "../../lib/bgg-format.ts";
import { BggMeta } from "../game/BggMeta.tsx";
import { Button } from "../ui/Button.tsx";
import { Modal } from "../ui/Modal.tsx";

// Full game detail shown when a tile in a profile's library/favorites/wishlist
// is clicked. One game per view, so it uses the longest `descriptions.loose`
// variant in full (no grid-fit truncation) plus the shared BGG meta block.

type GameDetailModalProps = {
  game: GameDefinition;
  onClose: () => void;
};

export function GameDetailModal({ game, onClose }: GameDetailModalProps) {
  const navigate = useNavigate();
  const summary = compactSummary(game.bgg);
  const description =
    game.descriptions.loose || game.descriptions.default || game.descriptions.tight;
  // The family's display name lives only on its canonical member (e.g.
  // Gloomhaven), so resolve it via `familyOf` — `game.family.name` is undefined
  // for non-canonical members like Frosthaven, which is why this used to render
  // "Frosthaven · Frosthaven". The variant is already encoded in the title, so
  // show just the family name, and omit it on the canonical member where it
  // would only repeat the title.
  const family = familyOf(game.slug);
  const familyLabel = family && family.displayName !== game.title ? family.displayName : null;
  const bggUrl = game.bggId > 0 ? `https://boardgamegeek.com/boardgame/${game.bggId}` : null;

  return (
    <Modal onClose={onClose} ariaLabel={game.title} panelClassName="max-w-lg max-h-[90vh]">
      <div
        style={{ "--accent": game.accentHex } as CSSProperties}
        className="flex max-h-[calc(90vh-3rem)] flex-col gap-3 overflow-y-auto"
      >
        <div className="overflow-hidden rounded-2xl ring-1 ring-[var(--accent)]/30">
          <img
            src={game.thumbnail}
            alt={game.title}
            decoding="async"
            className="h-44 w-full object-cover"
          />
        </div>

        <div>
          {familyLabel && (
            <p className="text-2xs uppercase tracking-[0.18em] text-[var(--accent)]">
              {familyLabel}
            </p>
          )}
          <h2 className="text-xl font-bold tracking-tight text-white">{game.title}</h2>
          {summary && (
            <p className="mt-0.5 text-2xs uppercase tracking-[0.18em] text-fg-muted">{summary}</p>
          )}
        </div>

        {description && <p className="text-sm leading-relaxed text-fg-secondary">{description}</p>}

        <BggMeta bgg={game.bgg} />

        <div className="mt-1 flex flex-wrap items-center gap-2">
          {game.kind === "playable" && (
            <Button onClick={() => navigate(`/play/${game.slug}`)}>Play</Button>
          )}
          {bggUrl && (
            <a
              href={bggUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-fg-secondary transition hover:border-accent-400/40 hover:text-accent-200"
            >
              View on BGG
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}
