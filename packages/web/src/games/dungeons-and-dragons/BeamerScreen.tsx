import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import type { BeamerEvent, DndSession } from "@boardgames/core/protocol";
import { BeamerEventSchema } from "@boardgames/core/protocol";
import { useEffect, useState } from "react";
import { D20Die } from "../../components/offline/D20Die";
import { Button, Input } from "../../components/ui";
import { sessionByCode, streamDndSession } from "../../lib/dnd-campaigns";
import { errorMessageOf } from "../../lib/error-message";

// The beamer / TTS companion — a second device pointed at the table
// (projector, TV). It joins the DM's session with the code shown on the
// Devices screen, then becomes exactly one thing: a fullscreen display of
// whatever image the DM uploads. No banner, no padding, no cropping.

const CODE_KEY = "dnd-beamer-code";

type Display = { kind: "splash" } | { kind: "image"; url: string };

export default function BeamerScreen() {
  const [code, setCode] = useState(() => localStorage.getItem(CODE_KEY) ?? "");
  const [session, setSession] = useState<DndSession | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [connected, setConnected] = useState(false);
  const [display, setDisplay] = useState<Display>({ kind: "splash" });

  const join = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setJoining(true);
    setJoinError(null);
    try {
      const result = await sessionByCode(trimmed);
      if (!result.session) {
        setJoinError("No table with that code — check the Devices screen on the DM's side.");
        return;
      }
      localStorage.setItem(CODE_KEY, trimmed);
      setSession(result.session);
    } catch (err) {
      setJoinError(errorMessageOf(err, "Joining failed."));
    } finally {
      setJoining(false);
    }
  };

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

  // The one job: the image, edge to edge, covering every scrap of chrome.
  if (session && display.kind === "image") {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <img src={display.url} alt="" className="h-full w-full object-contain" />
      </div>
    );
  }

  if (session) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-dnd-ink via-surface-950 to-black px-6 text-center">
        <span aria-hidden="true">
          <D20Die
            count={20}
            className={`dnd-die h-32 w-32 sm:h-40 sm:w-40 ${connected ? "dnd-die-animated" : "opacity-50"}`}
          />
        </span>
        <div>
          <p className="font-fantasy text-2xs font-bold uppercase tracking-eyebrow text-amber-300/80">
            {connected ? "The table is live" : "Reconnecting…"}
          </p>
          <h1 className="dnd-hero-title font-fantasy mt-2 text-4xl font-bold text-amber-100 sm:text-5xl">
            {session.campaignTitle ?? "The Adventure"}
          </h1>
          <p className="font-serif-body mt-3 text-sm text-amber-200/60">
            Awaiting the Dungeon Master's signal…
          </p>
        </div>
        <Button
          variant="ghost"
          tone="amber"
          size="xs"
          className="opacity-40 hover:opacity-100"
          onClick={() => {
            setSession(null);
            setDisplay({ kind: "splash" });
          }}
        >
          Change code
        </Button>
      </div>
    );
  }

  return (
    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 bg-gradient-to-b from-dnd-ink via-surface-950 to-black px-6 text-center">
      <span aria-hidden="true">
        <D20Die count={20} className="dnd-die h-24 w-24 opacity-70 sm:h-32 sm:w-32" />
      </span>
      <div>
        <p className="font-fantasy text-2xs font-bold uppercase tracking-eyebrow text-amber-300/80">
          Beamer &amp; voice companion
        </p>
        <h1 className="dnd-hero-title font-fantasy mt-2 text-3xl font-bold text-amber-100 sm:text-4xl">
          Join the table
        </h1>
        <p className="font-serif-body mx-auto mt-3 max-w-sm text-sm leading-relaxed text-amber-200/60">
          Enter the code from the Dungeon Master's Devices screen. This display then shows whatever
          the DM puts on it — fullscreen, nothing else.
        </p>
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void join();
        }}
      >
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CODE"
          maxLength={8}
          aria-label="Session code"
          className="font-fantasy w-40 text-center text-xl tracking-eyebrow"
        />
        <Button variant="tinted" tone="amber" type="submit" loading={joining}>
          Join
        </Button>
      </form>
      {joinError && <p className="text-xs text-rose-300">{joinError}</p>}
    </div>
  );
}
