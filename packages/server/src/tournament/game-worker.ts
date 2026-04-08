const config = JSON.parse(process.argv[2]) as {
  gameSlug: string;
  gameIndices: number[];
  config: Record<string, unknown>;
};

const { gameSlug, gameIndices } = config;

function send(msg: unknown): void {
  try {
    process.send?.(msg);
  } catch {
    process.exit(0);
  }
}

if (gameSlug === "lost-cities") {
  const { ALL_STRATEGIES } = await import("@boardgames/core/games/lost-cities/ai-strategies");
  const { simulateGame } = await import("@boardgames/core/games/lost-cities/tournament-runner");

  const { strategyAId, strategyBId } = config.config as {
    strategyAId: string;
    strategyBId: string;
  };
  const stratA = ALL_STRATEGIES.find((s) => s.id === strategyAId);
  const stratB = ALL_STRATEGIES.find((s) => s.id === strategyBId);

  if (!stratA || !stratB) {
    send({ kind: "error", message: `Unknown strategy: ${strategyAId} or ${strategyBId}` });
  } else {
    for (const i of gameIndices) {
      const aPlaysFirst = i % 2 === 0;
      const result = simulateGame(stratA, stratB, aPlaysFirst, i);
      send({
        kind: "game",
        gameIndex: i,
        scoreA: result.scoreA,
        scoreB: result.scoreB,
        log: result.log,
      });
    }
  }
} else if (gameSlug === "exploding-kittens") {
  const { simulateGame } = await import(
    "@boardgames/core/games/exploding-kittens/tournament-runner"
  );

  const { strategies } = config.config as { strategies: string[] };

  for (const i of gameIndices) {
    const winner = simulateGame(strategies as Parameters<typeof simulateGame>[0], i);
    send({
      kind: "game",
      gameIndex: i,
      winner,
    });
  }
} else if (gameSlug === "sushi-go") {
  const { simulateGame } = await import("@boardgames/core/games/sushi-go/tournament-runner");
  type StrategyId = import("@boardgames/core/games/sushi-go/ai/strategy").StrategyId;

  const { strategyAId, strategyBId } = config.config as {
    strategyAId: StrategyId;
    strategyBId: StrategyId;
  };

  for (const i of gameIndices) {
    const aPlaysFirst = i % 2 === 0;
    const result = simulateGame(strategyAId, strategyBId, aPlaysFirst, i);
    send({
      kind: "game",
      gameIndex: i,
      scoreA: result.scoreA,
      scoreB: result.scoreB,
      aPlaysFirst,
    });
  }
} else {
  send({ kind: "error", message: `Unknown game: ${gameSlug}` });
}

send({ kind: "done" });
