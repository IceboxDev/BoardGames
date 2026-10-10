import { HINT_IDS, type HintId } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { fetchGreeting } from "../../lib/greetings";
import { fetchOnboarding, markHintSeen } from "../../lib/onboarding";
import { qk } from "../../lib/query-keys";
import { Coachmark } from "../ui";

// First-use hints: after the welcome tour, the first time a new member
// meets each real control, a small bubble points at it. Screens only say
// "my control is on screen now" (`useOnboardingHint(id, active)`) and tag the
// control `data-tour="<id>"`; this provider decides what shows:
//   - at most ONE hint at a time, the earliest due in `HINT_IDS` order;
//   - never while a popup greeting (the tour itself included) is up;
//   - each hint once, ever — dismissal is saved on the server.

type Copy = { title: string; body: ReactNode };

export const HINT_COPY: Record<HintId, Copy> = {
  "calendar-start": {
    title: "Start here",
    body: (
      <>
        Tell the group which days you're free: tap <strong>Change my availability</strong>.
      </>
    ),
  },
  "calendar-cycle": {
    title: "Tap your days",
    body: (
      <>
        Once = <strong>Can</strong>, twice = <strong>Maybe</strong>, three times = clear. Then press{" "}
        <strong>Save</strong>.
      </>
    ),
  },
  "night-open": {
    title: "A night is locked in",
    body: <>Tap the day marked RSVP to see who's coming — and to answer.</>,
  },
  "night-rsvp": {
    title: "You're marked as going",
    body: (
      <>
        Opening the night counted you in. Can't make it? Switch to <strong>✗ Not going</strong>.
      </>
    ),
  },
  "night-vote": {
    title: "Vote for games",
    body: (
      <>
        ♥ <strong>Hype</strong> the games you want to play. <strong>Teach</strong> if you can
        explain one, <strong>Learn</strong> if you're new to it.
      </>
    ),
  },
};

/** The selector a hint's control carries. */
export function hintTarget(id: HintId): string {
  return `[data-tour="${id}"]`;
}

type Ctx = { register: (id: HintId) => () => void };
const HintsContext = createContext<Ctx | null>(null);

export function OnboardingHintsProvider({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const enabled = !!user && user.onlineMode !== "online";
  const hints = useQuery({
    queryKey: qk.onboarding(),
    queryFn: ({ signal }) => fetchOnboarding(signal),
    enabled,
    staleTime: 5 * 60_000,
  });
  // Watches the greeting the GreetingHost already fetches — never fetches it.
  const greeting = useQuery({
    queryKey: qk.greetings(),
    queryFn: ({ signal }) => fetchGreeting(signal),
    enabled: false,
  });
  const [active, setActive] = useState<ReadonlyMap<HintId, number>>(() => new Map());
  const [dismissed, setDismissed] = useState<ReadonlySet<HintId>>(() => new Set());
  const seen = useMutation({
    mutationFn: markHintSeen,
    onSuccess: (res) => qc.setQueryData(qk.onboarding(), res),
  });

  const register = useCallback((id: HintId) => {
    setActive((cur) => new Map(cur).set(id, (cur.get(id) ?? 0) + 1));
    return () =>
      setActive((cur) => {
        const next = new Map(cur);
        const n = (next.get(id) ?? 1) - 1;
        if (n <= 0) next.delete(id);
        else next.set(id, n);
        return next;
      });
  }, []);
  const ctx = useMemo(() => ({ register }), [register]);

  const due = new Set(hints.data?.hintsDue ?? []);
  const greetingUp = !!greeting.data?.greeting;
  const chosen = greetingUp
    ? undefined
    : HINT_IDS.find((id) => due.has(id) && active.has(id) && !dismissed.has(id));

  const dismiss = (id: HintId) => {
    setDismissed((cur) => new Set(cur).add(id));
    seen.mutate(id);
  };

  return (
    <HintsContext.Provider value={ctx}>
      {children}
      {chosen && (
        <Coachmark
          key={chosen}
          target={hintTarget(chosen)}
          title={HINT_COPY[chosen].title}
          onDismiss={() => dismiss(chosen)}
        >
          {HINT_COPY[chosen].body}
        </Coachmark>
      )}
    </HintsContext.Provider>
  );
}

/**
 * Declare that this hint's control (tagged `data-tour="<id>"`) is on screen
 * and the moment is right. The provider shows it if it's due and first in
 * line. A no-op outside the provider (previews, tests).
 */
export function useOnboardingHint(id: HintId, active: boolean): void {
  const ctx = useContext(HintsContext);
  useEffect(() => {
    if (!ctx || !active) return;
    return ctx.register(id);
  }, [ctx, id, active]);
}
