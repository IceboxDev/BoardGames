import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AvailabilityActionBar } from "../components/offline/AvailabilityActionBar";
import Calendar from "../components/offline/Calendar";
import { useSession } from "../lib/auth-client";
import {
  type Availability,
  type AvailabilityMap,
  fetchAvailability,
  loadAvailability,
  mapsEqual,
  pushAvailability,
  saveAvailability,
} from "../lib/offline-availability";
import { startOfWeekMonday } from "../lib/offline-week";

type Mode = "view" | "edit";

export default function OfflineDashboard() {
  const { data } = useSession();
  const userId = data?.user?.id;

  const today = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeekMonday(today), [today]);

  const [mode, setMode] = useState<Mode>("view");
  const [committed, setCommitted] = useState<AvailabilityMap>({});
  const [draft, setDraft] = useState<AvailabilityMap>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    const cached = loadAvailability(userId);
    setCommitted(cached);

    let cancelled = false;
    fetchAvailability()
      .then((server) => {
        if (cancelled) return;
        if (!mapsEqual(server, cached)) {
          setCommitted(server);
          saveAvailability(userId, server);
        }
      })
      .catch(() => {
        // keep cached state; surface errors only on Save
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  function enterEdit() {
    setDraft(committed);
    setError(null);
    setMode("edit");
  }

  function cancel() {
    setError(null);
    setMode("view");
  }

  async function save() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    try {
      await pushAvailability(draft);
      saveAvailability(userId, draft);
      setCommitted(draft);
      setMode("view");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleChange(key: string, value: Availability | undefined) {
    setDraft((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  const visible = mode === "edit" ? draft : committed;
  const markedCount = Object.keys(visible).length;

  return (
    <div className="flex min-h-dvh flex-col bg-surface-950 bg-grid">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 sm:px-6 sm:py-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-white"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
              clipRule="evenodd"
            />
          </svg>
          Profile
        </Link>
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-accent-400">
          Offline
        </span>
        <span aria-hidden="true" className="hidden w-16 sm:block" />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3 sm:gap-5 sm:px-6 sm:py-5">
        <p
          className={`shrink-0 text-center text-[11px] text-gray-400 ${
            mode === "edit" ? "" : "invisible"
          }`}
          aria-hidden={mode !== "edit"}
        >
          <span className="hidden sm:inline">Tap a day to cycle: </span>
          <span className="text-accent-300">Can</span>
          <span className="mx-1 opacity-50">→</span>
          <span className="text-amber-300">Maybe</span>
          <span className="mx-1 opacity-50">→</span>
          <span className="opacity-60">clear</span>
        </p>

        <Calendar
          weekStart={weekStart}
          availability={visible}
          onChange={handleChange}
          readonlyBefore={today}
          interactive={mode === "edit"}
        />

        <AvailabilityActionBar
          mode={mode}
          markedCount={markedCount}
          saving={saving}
          error={error}
          onEdit={enterEdit}
          onCancel={cancel}
          onSave={save}
        />
      </div>
    </div>
  );
}
