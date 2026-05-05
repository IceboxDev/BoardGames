import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import FamilyCard from "../components/FamilyCard";
import GameCard from "../components/GameCard";
import { TopNav, TopNavBackButton } from "../components/TopNav";
import { groupForPresentation } from "../games/families";
import { games } from "../games/registry";
import type { GameDefinition } from "../games/types";
import { useSession } from "../lib/auth-client";
import { fetchMyInventory } from "../lib/inventory";
import { qk } from "../lib/query-keys";

export default function GameGallery() {
  const { data } = useSession();
  const userId = data?.user?.id ?? null;

  const inventoryQuery = useQuery({
    queryKey: qk.inventory(userId),
    queryFn: ({ signal }) => fetchMyInventory(signal),
    enabled: !!userId,
  });

  const slugs = inventoryQuery.data ?? [];
  const loading = inventoryQuery.isPending;

  const owned = useMemo<GameDefinition[]>(
    () =>
      slugs
        .map((s) => games.find((g) => g.slug === s))
        .filter((g): g is GameDefinition => Boolean(g)),
    [slugs],
  );

  const units = useMemo(() => groupForPresentation(owned), [owned]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggleFamily(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface-950 bg-grid">
      <TopNav>
        <TopNavBackButton to="/" label="Dashboard" />
      </TopNav>

      <main className="flex min-h-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8 lg:px-12">
        <div className="shrink-0">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">My Gallery</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            {loading
              ? "Loading…"
              : owned.length === 0
                ? "Nothing here yet."
                : `${owned.length} ${owned.length === 1 ? "game" : "games"} in your library`}
          </p>
        </div>

        {loading ? null : owned.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="rounded-2xl border border-dashed border-white/10 px-10 py-16 text-center">
              <p className="text-sm text-gray-500">
                No games in your library yet. Ask an admin to add some.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {units.map((unit, i) => {
              if (unit.kind === "single") {
                return (
                  <GameCard
                    key={unit.game.slug}
                    game={unit.game}
                    index={i}
                    showComingSoon={false}
                  />
                );
              }
              const isOpen = expanded.has(unit.family.id);
              return (
                <div key={unit.family.id} className={isOpen ? "col-span-full" : "contents"}>
                  {isOpen ? (
                    <div className="flex flex-col gap-4">
                      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        <FamilyCard
                          family={unit.family}
                          visibleMembers={unit.visibleMembers}
                          expanded
                          onToggle={() => toggleFamily(unit.family.id)}
                          index={i}
                        />
                      </div>
                      <div
                        className="grid gap-4 rounded-2xl border border-[var(--accent)]/15 bg-[color-mix(in_srgb,var(--accent)_4%,var(--color-surface-900))] p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
                        style={
                          {
                            "--accent": unit.family.canonical.accentHex,
                          } as React.CSSProperties
                        }
                      >
                        {unit.visibleMembers.map((member, j) => (
                          <GameCard
                            key={member.slug}
                            game={member}
                            index={j}
                            showComingSoon={false}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <FamilyCard
                      family={unit.family}
                      visibleMembers={unit.visibleMembers}
                      expanded={false}
                      onToggle={() => toggleFamily(unit.family.id)}
                      index={i}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
