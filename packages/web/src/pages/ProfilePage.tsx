import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopNav, TopNavLink } from "../components/TopNav";
import { Button } from "../components/ui/Button";
import { games } from "../games/registry";
import type { GameDefinition } from "../games/types";
import { authClient, useSession } from "../lib/auth-client";
import { fetchMyInventory } from "../lib/inventory";
import { qk } from "../lib/query-keys";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { data } = useSession();
  const user = data?.user as
    | { name?: string; email?: string; role?: string; onlineEnabled?: boolean }
    | undefined;
  const userId = data?.user?.id ?? null;

  const onlineUnlocked = Boolean(user?.onlineEnabled);
  const isAdmin = user?.role === "admin";

  const { data: ownedSlugs = null } = useQuery({
    queryKey: qk.inventory(userId),
    queryFn: ({ signal }) => fetchMyInventory(signal),
    enabled: !!userId,
  });

  async function handleSignOut() {
    await authClient.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface-950 bg-grid">
      <TopNav>
        {isAdmin && <TopNavLink to="/admin">Admin</TopNavLink>}
        <TopNavLink onClick={handleSignOut}>Sign out</TopNavLink>
      </TopNav>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-12">
        <div className="mb-12 text-center">
          <p className="text-xs uppercase tracking-widest text-accent-400">Welcome</p>
          <h2 className="mt-2 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            {user?.name ? user.name.split(" ")[0] : "Player"}
          </h2>
          <p className="mt-3 text-sm text-gray-500">Choose how you'd like to play.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ModeButton
            title="Online"
            subtitle={onlineUnlocked ? "Multiplayer & live games" : "Locked — ask the admin"}
            locked={!onlineUnlocked}
            onClick={() => navigate("/games")}
            accent
          />
          <ModeButton
            title="Offline"
            subtitle="Plan in-person game nights"
            onClick={() => navigate("/offline")}
          />
        </div>

        <GalleryPreview ownedSlugs={ownedSlugs} onClick={() => navigate("/gallery")} />

        {!onlineUnlocked && (
          <p className="mt-8 text-center text-xs text-gray-500">
            Your account is signed in but online play hasn't been unlocked for you yet. The
            administrator can grant access from the admin panel.
          </p>
        )}
      </main>
    </div>
  );
}

type ModeButtonProps = {
  title: string;
  subtitle: string;
  locked?: boolean;
  accent?: boolean;
  onClick?: () => void;
};

function ModeButton({ title, subtitle, locked, accent, onClick }: ModeButtonProps) {
  const disabled = locked || !onClick;
  return (
    <Button
      type="button"
      variant={accent && !disabled ? "primary" : "secondary"}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="!h-auto flex-col items-start gap-1 px-6 py-6 text-left"
    >
      <span className="flex w-full items-center justify-between">
        <span className="text-xl font-semibold">{title}</span>
        {locked && <LockIcon />}
      </span>
      <span className="text-xs font-normal opacity-70">{subtitle}</span>
    </Button>
  );
}

type GalleryPreviewProps = {
  ownedSlugs: string[] | null;
  onClick: () => void;
};

const PREVIEW_THUMBS = 6;
const THUMB_W = 40; // h-10 w-10
const THUMB_GAP = 6; // gap-1.5
const BADGE_W = 40; // overflow badge same size as thumbs
const SLOT_RESERVE = 8; // safety margin so we never partially overflow

function GalleryPreview({ ownedSlugs, onClick }: GalleryPreviewProps) {
  const isLoading = ownedSlugs === null;
  const owned: GameDefinition[] = ownedSlugs
    ? ownedSlugs
        .map((s) => games.find((g) => g.slug === s))
        .filter((g): g is GameDefinition => Boolean(g))
    : [];

  // Measure the thumb-row slot so we can render only as many thumbnails as
  // actually fit. Pre-measurement we render PREVIEW_THUMBS; the row is
  // overflow-hidden so any sliver clip during the first frame doesn't escape
  // the parent.
  const rowRef = useRef<HTMLDivElement>(null);
  const [slotW, setSlotW] = useState(0);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSlotW(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = owned.length;
  // Reserve room for the +N badge, then floor on (slot − badge) / (thumb +
  // gap). Capped at PREVIEW_THUMBS, floored at 1 so we always show at least
  // one thumb when inventory is non-empty.
  const maxByWidth =
    slotW > 0
      ? Math.max(1, Math.floor((slotW - BADGE_W - SLOT_RESERVE) / (THUMB_W + THUMB_GAP)))
      : PREVIEW_THUMBS;
  const visibleCount = Math.min(total, Math.min(PREVIEW_THUMBS, maxByWidth));
  const previewGames = owned.slice(0, visibleCount);
  const overflow = total - visibleCount;
  const empty = !isLoading && total === 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group mt-6 flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-surface-900/60 px-5 py-3.5 text-left transition-all duration-300 hover:border-white/15 hover:bg-surface-900 sm:px-6 sm:py-4"
    >
      <div className="flex shrink-0 items-center gap-2 text-gray-300 transition-colors group-hover:text-white">
        <GalleryIcon />
        <span className="text-xs font-semibold uppercase tracking-[0.2em]">Gallery</span>
      </div>

      <div ref={rowRef} className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5">
        {isLoading ? (
          <div className="flex gap-1.5 overflow-hidden" aria-hidden="true">
            {Array.from({ length: PREVIEW_THUMBS }).map((_, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
                key={i}
                className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-surface-800"
              />
            ))}
          </div>
        ) : empty ? (
          <span className="text-xs text-gray-500">No games yet — ask an admin to add some</span>
        ) : (
          <>
            <div className="flex gap-1.5 overflow-hidden">
              {previewGames.map((g) => (
                <span
                  key={g.slug}
                  className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-800 ring-1 ring-[var(--accent)]/45"
                  style={{ "--accent": g.accentHex } as React.CSSProperties}
                >
                  <img
                    src={g.thumbnail}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </span>
              ))}
              {overflow > 0 && (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-800/80 text-[10px] font-semibold text-gray-400 ring-1 ring-white/10">
                  +{overflow}
                </span>
              )}
            </div>
            <span className="hidden truncate text-xs text-gray-500 sm:inline">
              {total} {total === 1 ? "game" : "games"}
            </span>
          </>
        )}
      </div>

      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4 shrink-0 text-gray-500 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-accent-300"
      >
        <path
          fillRule="evenodd"
          d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}

function GalleryIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1.25" />
      <rect x="11" y="3" width="6" height="6" rx="1.25" />
      <rect x="3" y="11" width="6" height="6" rx="1.25" />
      <rect x="11" y="11" width="6" height="6" rx="1.25" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 opacity-70"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
