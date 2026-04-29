import { Suspense } from "react";
import { Navigate, useParams } from "react-router-dom";
import { games } from "../games/registry";

export default function GameRouter() {
  const { slug } = useParams<{ slug: string }>();
  const game = games.find((g) => g.slug === slug);

  if (!game || !game.component) return <Navigate to="/games" replace />;

  const GameComponent = game.component;

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      {game.backgroundImage && (
        <div
          className="pointer-events-none fixed inset-0 z-0 animate-bg-fade-in"
          aria-hidden="true"
        >
          <img src={game.backgroundImage} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-surface-950/35" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-950/45 via-surface-950/15 to-surface-950/50" />
        </div>
      )}
      <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col">
        <Suspense
          fallback={
            <div className="flex min-h-0 flex-1 items-center justify-center text-gray-400">
              Loading...
            </div>
          }
        >
          <div className="flex min-h-0 w-full flex-1 flex-col">
            <GameComponent />
          </div>
        </Suspense>
      </div>
    </div>
  );
}
