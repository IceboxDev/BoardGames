import type { ChessAction } from "@boardgames/core/games/chess/schemas";
import { SoundToggle } from "../../../components/game-layout";
import { Button, Surface, useConfirm } from "../../../components/ui";

interface Props {
  legal: readonly ChessAction[];
  send: (action: ChessAction) => void;
  onFlip: () => void;
  muted: boolean;
  onToggleMute: () => void;
  /** After the game: the extra buttons the game-over view offers. */
  extra?: React.ReactNode;
}

const has = (legal: readonly ChessAction[], kind: ChessAction["kind"]) =>
  legal.find((a) => a.kind === kind);

/**
 * The bar under the board. Buttons only — what you can do right now (offers,
 * answers, claims, resign) plus Flip and sound. Whose turn it is shows on the
 * player strips; guidance lives in tooltips.
 */
export function ActionBar({ legal, send, onFlip, muted, onToggleMute, extra }: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const takeback = has(legal, "takeback");
  const requestTakeback = has(legal, "request-takeback");
  const acceptTakeback = has(legal, "accept-takeback");
  const declineTakeback = has(legal, "decline-takeback");
  const offerDraw = has(legal, "offer-draw");
  const acceptDraw = has(legal, "accept-draw");
  const declineDraw = has(legal, "decline-draw");
  const resign = has(legal, "resign");
  const claimWin = has(legal, "claim-win");
  const claims = legal.filter(
    (a): a is Extract<ChessAction, { kind: "claim-draw" }> => a.kind === "claim-draw",
  );

  const onResign = async () => {
    if (!resign) return;
    const ok = await confirm({
      title: "Resign this game?",
      description: "Your opponent wins. This can't be undone.",
      confirmLabel: "Resign",
    });
    if (ok) send(resign);
  };

  return (
    <Surface
      variant="raised"
      padding="sm"
      className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 whitespace-nowrap lg:grid lg:grid-cols-[1fr_auto_1fr]"
    >
      <div className="flex items-center gap-2">
        <Button size="xs" variant="ghost" onClick={onFlip} title="Turn the board around (F)">
          ⇅ Flip
        </Button>
        <SoundToggle muted={muted} onToggle={onToggleMute} />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {acceptDraw && (
          <Button
            size="xs"
            variant="success"
            onClick={() => send(acceptDraw)}
            title="Your opponent offers a draw"
          >
            ½ Accept draw
          </Button>
        )}
        {declineDraw && (
          <Button size="xs" variant="secondary" onClick={() => send(declineDraw)}>
            Decline draw
          </Button>
        )}
        {acceptTakeback && (
          <Button
            size="xs"
            variant="tinted"
            tone="sky"
            onClick={() => send(acceptTakeback)}
            title="Your opponent asks to take their last move back"
          >
            ↶ Allow takeback
          </Button>
        )}
        {declineTakeback && (
          <Button size="xs" variant="secondary" onClick={() => send(declineTakeback)}>
            Refuse takeback
          </Button>
        )}
        {claims.map((claim) => (
          <Button
            key={claim.reason}
            size="xs"
            variant="tinted"
            tone="amber"
            onClick={() => send(claim)}
            title={
              claim.reason === "threefold"
                ? "This position has appeared three times — you may claim a draw"
                : claim.reason === "fifty-move"
                  ? "Fifty moves without a capture or pawn move — you may claim a draw"
                  : "Your opponent left the game — end it as a draw"
            }
          >
            {claim.reason === "abandon" ? "Call it a draw" : "½ Claim draw"}
          </Button>
        ))}
        {claimWin && (
          <Button
            size="xs"
            variant="success"
            onClick={() => send(claimWin)}
            title="Your opponent left the game a minute ago — claim the win"
          >
            Claim victory
          </Button>
        )}
        {extra}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {takeback && (
          <Button
            size="xs"
            variant="secondary"
            onClick={() => send(takeback)}
            title="Take back your last move"
          >
            ↶ Takeback
          </Button>
        )}
        {requestTakeback && (
          <Button
            size="xs"
            variant="secondary"
            onClick={() => send(requestTakeback)}
            title="Ask your opponent to let you take back your last move"
          >
            ↶ Ask takeback
          </Button>
        )}
        {offerDraw && (
          <Button
            size="xs"
            variant="secondary"
            onClick={() => send(offerDraw)}
            title="Offer your opponent a draw"
          >
            ½ Offer draw
          </Button>
        )}
        {resign && (
          <Button size="xs" variant="danger" onClick={onResign} title="Give up this game">
            ⚑ Resign
          </Button>
        )}
      </div>
      {confirmDialog}
    </Surface>
  );
}
