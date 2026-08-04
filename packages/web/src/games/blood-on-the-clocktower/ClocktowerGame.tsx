import type { GameComponentProps } from "../types";
import Companion from "./companion/Companion";

/**
 * Blood on the Clocktower entry point. Only the Storyteller companion
 * (`/play/blood-on-the-clocktower/solo`) exists today; the multiplayer card
 * on the mode picker is inert until online rooms are built.
 */
export default function ClocktowerGame({ source }: GameComponentProps) {
  if (source === "solo") return <Companion />;
  return null;
}
