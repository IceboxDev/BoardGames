import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import type { BeamerEvent } from "@boardgames/core/protocol";
import { BeamerEventSchema } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { D20Die } from "../../components/offline/D20Die";
import { fetchActiveDndSession, streamDndSession } from "../../lib/dnd-campaigns";
import { qk } from "../../lib/query-keys";

// The beamer / TTS companion — meant for a second device pointed at the
// table (projector, TV). It polls for the DM's active session (which exists
// from the moment a campaign is opened), attaches to its SSE stream, and
// renders whatever the DM triggers. v1 wiring: connection status, campaign
// splash on connect, full-screen image on `show-image`, back to splash on
// `clear`. The trigger UI on the DM's side lands in a later slice.

const SERIF = { fontFamily: "ui-serif, Georgia, serif" } as const;

type Display = { kind: "splash" } | { kind: "image"; url: string };

export default function BeamerScreen() {
  const [connected, setConnected] = useState(false);
  const [campaignTitle, setCampaignTitle] = useState<string | null>(null);
  const [display, setDisplay] = useState<Display>({ kind: "splash" });

  // Find the DM's live session — keeps polling until one appears, and keeps
  // checking so a new session (campaign switch) reattaches the stream.
  const sessionQuery = useQuery({
    queryKey: qk.dndActiveSession(),
    queryFn: fetchActiveDndSession,
    refetchInterval: (query) => (query.state.data?.session ? 15_000 : 3000),
  });
  const session = sessionQuery.data?.session ?? null;

  useEffect(() => {
    if (!session) return;
    const source = streamDndSession(session.id);

    source.onmessage = (message) => {
      let event: BeamerEvent;
      try {
        event = BeamerEventSchema.parse(JSON.parse(message.data));
      } catch {
        return; // ignore malformed frames — the schema is the contract
      }
      if (event.type === "connected") {
        setConnected(true);
        setCampaignTitle(event.campaignTitle);
        setDisplay({ kind: "splash" });
      } else if (event.type === "show-image") {
        setDisplay({ kind: "image", url: event.url });
      } else if (event.type === "clear") {
        setDisplay({ kind: "splash" });
      }
    };
    source.onerror = () => setConnected(false); // EventSource auto-reconnects

    return () => {
      source.close();
      setConnected(false);
    };
  }, [session]);

  if (display.kind === "image") {
    return (
      <div className="relative z-10 flex h-full items-center justify-center bg-black">
        <img src={display.url} alt="" className="max-h-full max-w-full object-contain" />
      </div>
    );
  }

  return (
    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#1a0606] via-surface-950 to-black px-6 text-center">
      <span aria-hidden="true">
        <D20Die
          count={20}
          className={`dnd-die h-32 w-32 sm:h-40 sm:w-40 ${connected ? "dnd-die-animated" : "opacity-50"}`}
        />
      </span>
      {session && connected ? (
        <div>
          <p className="font-fantasy text-2xs font-bold uppercase tracking-[0.35em] text-amber-300/80">
            The table is live
          </p>
          <h1
            className="font-fantasy mt-2 text-4xl font-bold text-amber-100 sm:text-5xl"
            style={{ textShadow: "0 2px 14px rgba(0,0,0,0.7)" }}
          >
            {campaignTitle ?? "The Adventure"}
          </h1>
          <p className="mt-3 text-sm text-amber-200/60" style={SERIF}>
            Awaiting the Dungeon Master's signal…
          </p>
        </div>
      ) : (
        <div>
          <p className="font-fantasy text-2xs font-bold uppercase tracking-[0.35em] text-amber-300/80">
            Beamer &amp; voice companion
          </p>
          <h1
            className="font-fantasy mt-2 text-3xl font-bold text-amber-100 sm:text-4xl"
            style={{ textShadow: "0 2px 14px rgba(0,0,0,0.7)" }}
          >
            Searching for the table…
          </h1>
          <p
            className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-amber-200/60"
            style={SERIF}
          >
            Open a campaign on the Dungeon Master's screen and this display will attach itself to
            the session.
          </p>
        </div>
      )}
    </div>
  );
}
