// The hand-over switch as the screens read it — see privacy.tsx for what it
// means and the provider that owns it. Split from the provider so component
// modules stay Fast-Refresh clean.

import { createContext, useContext } from "react";

export type Privacy = {
  /** True while the phone is (about to be) in a player's hands. */
  handOver: boolean;
  setHandOver: (on: boolean) => void;
};

export const PrivacyContext = createContext<Privacy>({ handOver: false, setHandOver: () => {} });

export function usePrivacy(): Privacy {
  return useContext(PrivacyContext);
}

/** True while Storyteller-only information must stay off the screen. */
export function useHandOver(): boolean {
  return useContext(PrivacyContext).handOver;
}
