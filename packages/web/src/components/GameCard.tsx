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
  /** Above-the-fold hint forwarded to the thumbnail (eager + high priority). */
  priority?: boolean;
};

export default function GameCard({
  game,
  href,
  index = 0,
  showComingSoon = true,
  priority = false,
}: Props) {
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
        priority={priority}
      />
      <GameCardBody title={game.title} affordance={href ? "arrow" : null}>
        {summary && <GameCardMeta>{summary}</GameCardMeta>}
        <GameCardDescription descriptions={game.descriptions} />
        <BggMeta bgg={game.bgg} />
      </GameCardBody>
    </GameCardChrome>
  );
}
