import { Suspense } from "react";
import { Navigate, useParams } from "react-router-dom";
import { games } from "../games/registry";

export default function GameRouter() {
  const { slug } = useParams<{ slug: string }>();
  const game = games.find((g) => g.slug === slug);

  if (!game) return <Navigate to="/" replace />;

  const GameComponent = game.component;

  return (
    <Suspense
      fallback={
        <div className="flex h-[60vh] items-center justify-center text-gray-400">Loading...</div>
      }
    >
      <GameComponent />
    </Suspense>
  );
}
