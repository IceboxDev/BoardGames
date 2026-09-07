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
} else if (gameSlug === "durak") {
  const { simulateGame } = await import("@boardgames/core/games/durak/tournament-runner");
  type AIStrategyId = import("@boardgames/core/games/durak/types").AIStrategyId;

  const { strategies } = config.config as { strategies: AIStrategyId[] };

  for (const i of gameIndices) {
    const durak = simulateGame(strategies, i);
    send({
      kind: "game",
      gameIndex: i,
      durak,
    });
  }
} else if (gameSlug === "senso-battle-for-japan") {
  const { seatPattern, simulateGame } = await import(
    "@boardgames/core/games/senso-battle-for-japan/tournament-runner"
  );
  type AIStrategyId = import("@boardgames/core/games/senso-battle-for-japan/types").AIStrategyId;

  // The grid posts a pair plus a table size; seats alternate A,B,A,B… and
  // B,A,B,A… per game so both strategies hold every seat equally often.
  const cfg = config.config as {
    strategyAId?: AIStrategyId;
    strategyBId?: AIStrategyId;
    playerCount?: number;
  };
  const a = cfg.strategyAId;
  const b = cfg.strategyBId;
  const playerCount = Math.min(5, Math.max(2, Math.trunc(cfg.playerCount ?? 2)));
  if (!a || !b) {
    send({ kind: "error", message: "senso-battle-for-japan needs two strategies" });
  } else {
    for (const i of gameIndices) {
      const seats = seatPattern(a, b, playerCount, i);
      const winner = simulateGame(seats, i);
      send({
        kind: "game",
        gameIndex: i,
        winner,
        winnerStrategy: winner < 0 ? null : seats[winner],
      });
    }
  }
} else {
  send({ kind: "error", message: `Unknown game: ${gameSlug}` });
}

send({ kind: "done" });
