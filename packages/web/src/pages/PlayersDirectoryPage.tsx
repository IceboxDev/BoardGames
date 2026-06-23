import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SearchIcon, UsersIcon } from "../components/icons";
import { PlayerCard } from "../components/profile/PlayerCard.tsx";
import { TopNav, TopNavBackButton, TopNavLink } from "../components/TopNav";
import { EmptyState } from "../components/ui/EmptyState.tsx";
import { Input } from "../components/ui/Input.tsx";
import { PageMain, PageShell } from "../components/ui/PageShell.tsx";
import { useCurrentUser } from "../hooks/useCurrentUser.ts";
import { fetchPlayers } from "../lib/profile.ts";
import { qk } from "../lib/query-keys.ts";

export default function PlayersDirectoryPage() {
  const { user } = useCurrentUser();
  const [search, setSearch] = useState("");

  const playersQuery = useQuery({
    queryKey: qk.players(),
    queryFn: ({ signal }) => fetchPlayers(signal),
  });

  const filtered = useMemo(() => {
    const all = playersQuery.data?.players ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) => p.name.toLowerCase().includes(q));
  }, [playersQuery.data, search]);

  const topNav = (
    <TopNav>
      <TopNavBackButton to="/" label="Dashboard" />
      {user && <TopNavLink to={`/u/${user.id}`}>My profile</TopNavLink>}
    </TopNav>
  );

  return (
    <PageShell topNav={topNav}>
      <PageMain width="6xl" padding="spacious">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              <UsersIcon className="h-6 w-6 text-accent-300" />
              Players
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              Browse the group and peek at everyone's library, favorites, and stats.
            </p>
          </div>
          <div className="relative sm:w-64">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted">
              <SearchIcon />
            </span>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players…"
              aria-label="Search players"
              className="pl-9"
            />
          </div>
        </div>

        <div className="mt-6">
          {playersQuery.isLoading ? (
            <div className="flex min-h-[30vh] items-center justify-center text-sm text-fg-muted">
              Loading players…
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<UsersIcon className="h-4 w-4" />}
              title={search ? "No players match your search" : "No players yet"}
            />
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {filtered.map((player) => (
                <li key={player.id}>
                  <PlayerCard player={player} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </PageMain>
    </PageShell>
  );
}
