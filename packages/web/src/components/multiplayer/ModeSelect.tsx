import { lazy, type ReactNode, Suspense, useState } from "react";
import { SetupHeader, SetupLayout } from "../setup";

const RulesViewer = lazy(() =>
  import("../rules/RulesViewer").then((m) => ({ default: m.RulesViewer })),
);

interface ModeSelectProps {
  title: string;
  subtitle?: string;
  soloLabel?: string;
  rulesUrl?: string;
  onSolo?: () => void;
  onMultiplayer: () => void;
  onMatchHistory?: () => void;
  onTournament?: () => void;
}

/* ── Per-label visual identity for the solo button ── */

interface SoloStyle {
  icon: ReactNode;
  hoverBorder: string;
  hoverText: string;
  iconBg: string;
  iconBgHover: string;
  iconColor: string;
  glowColor: string;
  description: string;
}

const AI_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7" aria-hidden="true">
    <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 110 2h-1v1a3 3 0 01-3 3H7a3 3 0 01-3-3v-1H3a1 1 0 110-2h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2zM9.5 13a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm5 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
  </svg>
);

const SOLO_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7" aria-hidden="true">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
);

const TRAINER_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7" aria-hidden="true">
    <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
  </svg>
);

function getSoloStyle(label: string): SoloStyle {
  switch (label) {
    case "Solo":
      return {
        icon: SOLO_ICON,
        hoverBorder: "hover:border-violet-500/50",
        hoverText: "group-hover:text-violet-300",
        iconBg: "bg-violet-500/10",
        iconBgHover: "group-hover:bg-violet-500/20",
        iconColor: "text-violet-400",
        glowColor: "hover:shadow-violet-500/20",
        description: "Control all players yourself",
      };
    case "Trainer":
      return {
        icon: TRAINER_ICON,
        hoverBorder: "hover:border-amber-500/50",
        hoverText: "group-hover:text-amber-300",
        iconBg: "bg-amber-500/10",
        iconBgHover: "group-hover:bg-amber-500/20",
        iconColor: "text-amber-400",
        glowColor: "hover:shadow-amber-500/20",
        description: "Practice and sharpen your skills",
      };
    default:
      return {
        icon: AI_ICON,
        hoverBorder: "hover:border-blue-500/50",
        hoverText: "group-hover:text-blue-300",
        iconBg: "bg-blue-500/10",
        iconBgHover: "group-hover:bg-blue-500/20",
        iconColor: "text-blue-400",
        glowColor: "hover:shadow-blue-500/20",
        description: "Challenge a computer opponent",
      };
  }
}

/* ── Component ────────────────────────────────────── */

export function ModeSelect({
  title,
  subtitle,
  soloLabel = "Play vs AI",
  rulesUrl,
  onSolo,
  onMultiplayer,
  onMatchHistory,
  onTournament,
}: ModeSelectProps) {
  const solo = getSoloStyle(soloLabel);
  const [showRules, setShowRules] = useState(false);

  return (
    <SetupLayout>
      <SetupHeader title={title} subtitle={subtitle} />

      {/* Rules button — integrated below subtitle */}
      {rulesUrl && (
        <button
          type="button"
          onClick={() => setShowRules(true)}
          className="animate-card-fade-up -mt-6 mb-8 inline-flex items-center gap-1.5 rounded-full border border-gray-700/40 bg-gray-800/30 px-4 py-1.5 text-xs font-medium text-gray-400 transition-all duration-200 hover:border-amber-500/40 hover:bg-amber-500/5 hover:text-amber-400"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06V3.56a.75.75 0 00-.546-.722A9.006 9.006 0 0015 2.5a9.006 9.006 0 00-4.25 1.065v13.255zM9.25 4.565A9.006 9.006 0 005 2.5a9.006 9.006 0 00-2.454.338A.75.75 0 002 3.56v11.5a.75.75 0 00.954.722A7.462 7.462 0 015 15.5a7.462 7.462 0 014.25 1.32V4.565z" />
          </svg>
          How to Play
        </button>
      )}

      {/* Primary actions — generous spacing */}
      <div
        className={`mx-auto grid w-full max-w-xl grid-cols-1 gap-5 ${onSolo ? "sm:grid-cols-2" : "max-w-xs"}`}
      >
        {onSolo && (
          <button
            type="button"
            onClick={onSolo}
            className={`animate-card-fade-up group flex flex-col items-center gap-4 rounded-2xl border border-gray-700/60 bg-gray-800/30 px-6 py-8 text-center shadow-lg shadow-transparent transition-all duration-300 hover:-translate-y-1 hover:bg-gray-800/60 hover:shadow-xl ${solo.hoverBorder} ${solo.glowColor}`}
          >
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-colors duration-300 ${solo.iconBg} ${solo.iconColor} ${solo.iconBgHover}`}
            >
              {solo.icon}
            </div>
            <div>
              <div
                className={`text-base font-semibold text-white transition-colors ${solo.hoverText}`}
              >
                {soloLabel}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{solo.description}</p>
            </div>
          </button>
        )}

        <button
          type="button"
          onClick={onMultiplayer}
          className="animate-card-fade-up group flex flex-col items-center gap-4 rounded-2xl border border-gray-700/60 bg-gray-800/30 px-6 py-8 text-center shadow-lg shadow-transparent transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/50 hover:bg-gray-800/60 hover:shadow-xl hover:shadow-emerald-500/20"
          style={{ animationDelay: "60ms" }}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 transition-colors duration-300 group-hover:bg-emerald-500/20">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7" aria-hidden="true">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
          </div>
          <div>
            <div className="text-base font-semibold text-white transition-colors group-hover:text-emerald-300">
              Multiplayer
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
              Play with friends on your network
            </p>
          </div>
        </button>
      </div>

      {/* Secondary actions — separated with breathing room */}
      {(onMatchHistory || onTournament) && (
        <div className="mx-auto mt-10 w-full max-w-xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-700/60 to-transparent" />
          </div>
          <div
            className={`grid w-full grid-cols-1 gap-3 ${onMatchHistory && onTournament ? "sm:grid-cols-2" : ""}`}
          >
            {onMatchHistory && (
              <button
                type="button"
                onClick={onMatchHistory}
                className="animate-card-fade-up group flex w-full items-center gap-3 rounded-xl border border-gray-700/40 bg-gray-800/20 px-5 py-3.5 text-left transition-all duration-200 hover:border-gray-600/60 hover:bg-gray-800/50"
                style={{ animationDelay: "120ms" }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-700/30 text-gray-400 transition-colors group-hover:bg-emerald-500/10 group-hover:text-emerald-400">
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4.5 w-4.5"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-300 transition-colors group-hover:text-white">
                    Match History
                  </div>
                  <p className="mt-0.5 text-[11px] text-gray-600">Review your past games</p>
                </div>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 shrink-0 text-gray-700 transition-all group-hover:translate-x-0.5 group-hover:text-gray-500"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}

            {onTournament && (
              <button
                type="button"
                onClick={onTournament}
                className="animate-card-fade-up group flex w-full items-center gap-3 rounded-xl border border-gray-700/40 bg-gray-800/20 px-5 py-3.5 text-left transition-all duration-200 hover:border-gray-600/60 hover:bg-gray-800/50"
                style={{ animationDelay: "180ms" }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-700/30 text-gray-400 transition-colors group-hover:bg-indigo-500/10 group-hover:text-indigo-400">
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4.5 w-4.5"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 1c-1.828 0-3.623.149-5.371.435a.75.75 0 00-.629.74v.659c0 2.457.82 4.776 2.312 6.644A17.1 17.1 0 009 11.874V15H7a.75.75 0 000 1.5h6a.75.75 0 000-1.5h-2v-3.126a17.1 17.1 0 002.688-2.396A11.413 11.413 0 0016 3.834v-.66a.75.75 0 00-.629-.739A33.668 33.668 0 0010 1zM5.5 3.06a31.17 31.17 0 019 0v.774a9.913 9.913 0 01-2.012 5.78A15.59 15.59 0 0110 11.96a15.59 15.59 0 01-2.488-2.346A9.913 9.913 0 015.5 3.834V3.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-300 transition-colors group-hover:text-white">
                    AI Tournament
                  </div>
                  <p className="mt-0.5 text-[11px] text-gray-600">
                    Watch AI strategies battle each other
                  </p>
                </div>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 shrink-0 text-gray-700 transition-all group-hover:translate-x-0.5 group-hover:text-gray-500"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Rules overlay */}
      {showRules && rulesUrl && (
        <Suspense fallback={null}>
          <RulesViewer url={rulesUrl} onClose={() => setShowRules(false)} />
        </Suspense>
      )}
    </SetupLayout>
  );
}
