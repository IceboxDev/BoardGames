import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Calendar from "../components/offline/Calendar";
import { useSession } from "../lib/auth-client";
import {
  type Availability,
  type AvailabilityMap,
  loadAvailability,
  saveAvailability,
} from "../lib/offline-availability";

type Tab = "play" | "plan";

export default function OfflineDashboard() {
  const { data } = useSession();
  const userId = data?.user?.id ?? null;

  const [tab, setTab] = useState<Tab>("play");
  const [availability, setAvailability] = useState<AvailabilityMap>({});

  const today = useMemo(() => new Date(), []);
  const playMonth = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const planMonth = useMemo(() => new Date(today.getFullYear(), today.getMonth() + 1, 1), [today]);

  useEffect(() => {
    if (!userId) return;
    setAvailability(loadAvailability(userId));
  }, [userId]);

  function handleChange(key: string, value: Availability | undefined) {
    if (!userId) return;
    setAvailability((prev) => {
      const next = { ...prev };
      if (value === undefined) {
        delete next[key];
      } else {
        next[key] = value;
      }
      saveAvailability(userId, next);
      return next;
    });
  }

  const monthForTab = tab === "play" ? playMonth : planMonth;
  const fullLabel = monthForTab.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

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
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="inline-flex rounded-2xl border border-white/10 bg-surface-900/70 p-1 shadow-lg shadow-black/30 backdrop-blur">
            <TabButton active={tab === "play"} onClick={() => setTab("play")}>
              <TabLabel kind="Play" month={playMonth} />
            </TabButton>
            <TabButton active={tab === "plan"} onClick={() => setTab("plan")}>
              <TabLabel kind="Plan" month={planMonth} />
            </TabButton>
          </div>
          <p className="text-[11px] text-gray-500">
            <span className="hidden sm:inline">Tap a day to cycle: </span>
            <span className="text-accent-300">Can</span>
            <span className="mx-1 opacity-50">→</span>
            <span className="text-amber-300">Maybe</span>
            <span className="mx-1 opacity-50">→</span>
            <span className="opacity-60">clear</span>
          </p>
        </div>

        <div className="sr-only" aria-live="polite">
          {fullLabel}
        </div>

        <Calendar
          key={tab}
          monthDate={monthForTab}
          availability={availability}
          onChange={handleChange}
          readonlyBefore={tab === "play" ? today : undefined}
        />
      </div>
    </div>
  );
}

type TabButtonProps = {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative rounded-xl px-5 py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 sm:px-7 sm:py-2.5 ${
        active
          ? "bg-gradient-to-br from-accent-500/30 via-accent-500/15 to-transparent text-white shadow-inner"
          : "text-gray-400 hover:text-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

function TabLabel({ kind, month }: { kind: "Play" | "Plan"; month: Date }) {
  const label = month.toLocaleDateString(undefined, { month: "long" });
  return (
    <span className="flex flex-col items-center leading-tight">
      <span className="text-[10px] font-semibold uppercase tracking-[0.25em] opacity-70">
        {kind}
      </span>
      <span className="text-sm font-semibold sm:text-base">{label}</span>
    </span>
  );
}
