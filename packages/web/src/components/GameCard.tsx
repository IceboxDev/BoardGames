import type { GameDefinition } from "../games/types";
import { compactSummary } from "../lib/bgg-format";
import {
  BggMeta,
  ComingSoonBadge,
  GameCardBody,
  GameCardChrome,
  GameCardDescription,
  GameCardMeta,
  GameCardThumb,
} from "./game";

type Props = {
  game: GameDefinition;
  href?: string;
  index?: number;
  /** Whether to render the "Coming soon" badge for catalog-only games. Default true. */
  showComingSoon?: boolean;
};

export default function GameCard({ game, href, index = 0, showComingSoon = true }: Props) {
  // Catalog grid uses `loose` (~360 chars) — sized to overflow the
  // `line-clamp-6` ceiling at text-sm so the description always fills the
  // card. See GameDescriptions docs for variant mapping.
  const description = game.descriptions.loose;
  const summary = compactSummary(game.bgg);

  return (
    <GameCardChrome
      accentHex={game.accentHex}
      index={index}
      as={href ? { kind: "link", to: href } : { kind: "div" }}
    >
      <GameCardThumb
        src={game.thumbnail}
        badgeTopLeft={showComingSoon && game.kind === "catalog" ? <ComingSoonBadge /> : undefined}
      />
      <GameCardBody title={game.title} affordance={href ? "arrow" : null}>
        {summary && <GameCardMeta>{summary}</GameCardMeta>}
        {description && <GameCardDescription>{description}</GameCardDescription>}
        <BggMeta bgg={game.bgg} />
      </GameCardBody>
    </GameCardChrome>
  );
}
