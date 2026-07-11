import type { BgaFoldState } from "@boardgames/core/games/7-wonders/bga/adapter";
import {
  applyBgaEvent,
  initBgaFold,
  toSpectatorView,
} from "@boardgames/core/games/7-wonders/bga/adapter";
import type { BgaSpectatorView } from "@boardgames/core/games/7-wonders/bga/types";
import type { BgaSession } from "@boardgames/core/protocol";
import { BgaStreamEventSchema } from "@boardgames/core/protocol";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SetupHeader, SetupLayout } from "../../../components/setup";
import { Button, ErrorAlert, Field } from "../../../components/ui";
import { useGameShell } from "../../../hooks/useGameShell";
import {
  bgaSessionByCode,
  createBgaSession,
  fetchActiveBgaSession,
  streamBgaSession,
} from "../../../lib/bga";
import { gameLog } from "../../../lib/game-log";
import BgaBoard from "./BgaBoard";

const CODE_KEY = "bga-bridge-code";

/**
 * "Connect to BGA": bridge a live BGA 7 Wonders table (owner shows the
 * ingest token for the userscript) or spectate one by code. Both paths end
 * on the same read-only board rendered from the SSE event stream via the
 * core adapter (`me: null` spectator view).
 */
export default function BgaScreen() {
  const navigate = useNavigate();
  const { def } = useGameShell();
  const [session, setSession] = useState<BgaSession | null>(null);
  const [ingestToken, setIngestToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [code, setCode] = useState(() => localStorage.getItem(CODE_KEY) ?? "");
  const codeId = useId();

  const back = () => navigate(`/play/${def.slug}/mp/join`);

  // Auto-restore: if a bridge session is already active for this account (the
  // userscript is bridging), jump straight into the spectate view instead of
  // making the user click "Bridge my BGA table" every page load.
  useEffect(() => {
    let cancelled = false;
    fetchActiveBgaSession()
      .then(({ session: active }) => {
        if (!cancelled && active) setSession(active);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const host = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { session: created, ingestToken: token } = await createBgaSession("7-wonders");
      setSession(created);
      setIngestToken(token);
      localStorage.setItem(CODE_KEY, created.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a bridge session");
    } finally {
      setBusy(false);
    }
  }, []);

  const spectate = useCallback(async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const { session: found } = await bgaSessionByCode(trimmed);
      if (!found) {
        setError(`No bridge session found for code ${trimmed}`);
        return;
      }
      setSession(found);
      setIngestToken(null);
      localStorage.setItem(CODE_KEY, trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not look up that code");
    } finally {
      setBusy(false);
    }
  }, [code]);

  if (restoring && !session) {
    return (
      <SetupLayout>
        <SetupHeader title="Connect to BGA" subtitle="Checking for an active bridge…" />
      </SetupLayout>
    );
  }

  if (!session) {
    return (
      <SetupLayout>
        <SetupHeader
          title="Connect to BGA"
          subtitle="Mirror a live Board Game Arena 7 Wonders table in this board"
        />
        {error && (
          <ErrorAlert message={error} className="mx-auto mb-4 w-full max-w-sm text-center" />
        )}
        <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
          <Button variant="primary" size="lg" disabled={busy} onClick={() => void host()}>
            Bridge my BGA table
          </Button>
          <Field label="…or spectate with a code" htmlFor={codeId}>
            <input
              id={codeId}
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void spectate();
              }}
              placeholder="K7XMPQ"
              maxLength={8}
              className="w-full rounded-lg border border-white/10 bg-surface-800/60 px-4 py-3 text-center text-2xl font-bold uppercase tracking-[0.3em] text-white placeholder:text-fg-disabled outline-none transition-colors focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
            />
          </Field>
          <Button
            variant="secondary"
            size="lg"
            disabled={busy || code.trim().length < 4}
            onClick={() => void spectate()}
          >
            Spectate
          </Button>
          <Button variant="link" onClick={back} className="mt-2">
            Back
          </Button>
        </div>
      </SetupLayout>
    );
  }

  return (
    <BgaSpectateView
      session={session}
      ingestToken={ingestToken}
      onLeave={() => {
        setSession(null);
        setIngestToken(null);
      }}
    />
  );
}

function BgaSpectateView({
  session,
  ingestToken,
  onLeave,
}: {
  session: BgaSession;
  ingestToken: string | null;
  onLeave: () => void;
}) {
  const foldRef = useRef<BgaFoldState>(initBgaFold());
  const [view, setView] = useState<BgaSpectatorView | null>(null);
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      if (closed) return;
      // Reset the fold on every (re)connect: the buffer replay always starts at
      // a gamedatas checkpoint, so this rebuilds cleanly.
      foldRef.current = initBgaFold();
      setView(null);
      source = streamBgaSession(session.id);
      source.onopen = () => setConnected(true);
      source.onmessage = (message) => {
        const parsed = BgaStreamEventSchema.safeParse(JSON.parse(message.data));
        if (!parsed.success) {
          gameLog("bga frame dropped (schema mismatch)");
          return;
        }
        if (parsed.data.type !== "event") return;
        foldRef.current = applyBgaEvent(foldRef.current, parsed.data.event);
        setView(toSpectatorView(foldRef.current));
      };
      source.onerror = () => {
        setConnected(false);
        // The browser retries network drops itself, but a clean HTTP error
        // (e.g. a 404 while the session is being revived after a server
        // restart) closes the stream for good — reopen it ourselves.
        if (source && source.readyState === EventSource.CLOSED) {
          source.close();
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    };
    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [session.id]);

  const ingestUrl = `${window.location.origin}/api/bga-ingest`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-fg-primary">BGA bridge</h1>
          <span className="rounded bg-surface-800 px-2 py-0.5 font-mono text-sm tracking-[0.25em] text-emerald-300">
            {session.code}
          </span>
          <span className={`text-xs ${connected ? "text-emerald-400" : "text-rose-400"}`}>
            {connected ? "● live" : "● reconnecting…"}
          </span>
        </div>
        <Button variant="link" size="xs" onClick={onLeave}>
          Change session
        </Button>
      </div>

      {ingestToken && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-fg-secondary">
          <p className="mb-1 font-semibold text-amber-200">Userscript setup (host)</p>
          <p>
            1. Install the Tampermonkey script from <code>tools/bga-userscript</code>. 2. In its
            menu, run "Set bridge server URL + token" with:
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs">
            <span className="rounded bg-surface-800 px-2 py-1">{ingestUrl}</span>
            <span className="rounded bg-surface-800 px-2 py-1">{ingestToken}</span>
            <Button
              variant="secondary"
              size="xs"
              onClick={() => {
                void navigator.clipboard.writeText(ingestToken);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied!" : "Copy token"}
            </Button>
          </div>
          <p className="mt-1">
            3. Open your BGA 7 Wonders table — the board appears here when the first snapshot
            arrives. Share code <span className="font-mono">{session.code}</span> with anyone who
            wants to watch.
          </p>
        </div>
      )}

      {view ? (
        <BgaBoard view={view} />
      ) : (
        <div className="flex h-48 items-center justify-center rounded-lg border border-white/10 bg-surface-900/60">
          <p className="text-sm italic text-fg-disabled">
            Waiting for the first game snapshot from BGA…
          </p>
        </div>
      )}
    </div>
  );
}
