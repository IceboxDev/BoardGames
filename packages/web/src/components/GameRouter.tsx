import { Suspense } from "react";
import { Navigate, useParams } from "react-router-dom";
import { games } from "../games/registry";

export default function GameRouter() {
  const { slug } = useParams<{ slug: string }>();
  const game = games.find((g) => g.slug === slug);

  if (!game) return <Navigate to="/" replace />;

  const GameComponent = game.component;

  return (
    <>
      {game.backgroundImage && (
        <div className="fixed inset-0 z-0 animate-bg-fade-in" aria-hidden="true">
          <img src={game.backgroundImage} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-surface-950/50" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/30 to-surface-950/70" />
        </div>
      )}
      <div className="relative z-10">
        <Suspense
          fallback={
            <div className="flex h-[60vh] items-center justify-center text-gray-400">
              Loading...
            </div>
          }
        >
          <GameComponent />
        </Suspense>
      </div>
    </>
  );
}
