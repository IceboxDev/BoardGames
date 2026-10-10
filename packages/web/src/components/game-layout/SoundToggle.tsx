import { SoundOffIcon, SoundOnIcon } from "../icons";
import { IconButton } from "../ui/IconButton";

/** A game's sound on / off button for its action bar (the choice lives in `useMuted`). */
export function SoundToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <IconButton
      size="sm"
      variant="ghost"
      icon={muted ? <SoundOffIcon /> : <SoundOnIcon />}
      aria-label={muted ? "Turn sounds on" : "Turn sounds off"}
      title={muted ? "Turn sounds on" : "Turn sounds off"}
      aria-pressed={!muted}
      onClick={onToggle}
    />
  );
}
