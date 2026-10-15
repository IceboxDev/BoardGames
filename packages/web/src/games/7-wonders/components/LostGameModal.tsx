import { Button, Modal, ModalBody, ModalFooter } from "../../../components/ui";
import { artUrl } from "../logic/art";

/**
 * The server no longer knows this game — it restarted, and live games live
 * in its memory. Said plainly, with the ways on, instead of a board that
 * silently stops answering.
 */
export default function LostGameModal({
  onPlayAgain,
  onChangeSetup,
  onMenu,
}: {
  onPlayAgain: (() => void) | null;
  onChangeSetup: (() => void) | null;
  onMenu: () => void;
}) {
  return (
    <Modal
      onClose={onMenu}
      size="sm"
      eyebrow="Connection lost"
      title="This game has ended"
      closeOnBackdrop={false}
      hideCloseButton
    >
      <ModalBody>
        {artUrl("bg-setup") && (
          <img
            src={artUrl("bg-setup")}
            alt=""
            aria-hidden
            draggable={false}
            className="mb-3 h-28 w-full select-none rounded-card-lg object-cover opacity-80 grayscale-[35%] ring-1 ring-black/50"
          />
        )}
        <p className="text-sm text-fg-secondary">
          The game server restarted, and games in progress don't survive a restart. Your moves from
          here on can't reach it.
        </p>
      </ModalBody>
      <ModalFooter
        start={
          <Button variant="ghost" onClick={onMenu}>
            Back to menu
          </Button>
        }
      >
        {onChangeSetup && (
          <Button variant="secondary" onClick={onChangeSetup}>
            Change setup
          </Button>
        )}
        {onPlayAgain && <Button onClick={onPlayAgain}>New game</Button>}
      </ModalFooter>
    </Modal>
  );
}
