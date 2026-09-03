import { buildPlayerView } from "@boardgames/core/games/decrypto/player-view";
import {
  buildRoundTransmissions,
  buildTeams,
  defaultTeamPlayers,
  resolveTransmission,
} from "@boardgames/core/games/decrypto/rules";
import type {
  Code,
  DecryptoContext,
  DecryptoViewPhase,
  Transmission,
} from "@boardgames/core/games/decrypto/types";
import { DEFAULT_BEATS } from "@boardgames/core/games/decrypto/types";
import { createRng } from "@boardgames/core/lib/rng";
import GameBoard from "../games/decrypto/components/GameBoard";
import GameOverScreen from "../games/decrypto/components/GameOverScreen";

// Dev-only Decrypto board preview — the real GameBoard/GameOverScreen fed a
// mock mid-game state built through the actual core helpers, no auth/WS/AI.
// Exists so phone-width regressions can be reproduced headlessly (the
// RsvpPreview pattern): /dev/decrypto-preview?scene=<name>&frame=WxH
// Scenes: encrypt | decode | intercept | waiting | reveal | skip | gameover

function baseCtx(): DecryptoContext {
  const rng = createRng(7);
  const teams = buildTeams({
    variant: "standard",
    teamPlayers: defaultTeamPlayers("standard"),
    rng,
  });
  teams[0].keywords = ["dragonfly", "cocktail", "sombrero", "shadow"];
  teams[1].keywords = ["harvest", "zeppelin", "mirror", "quarantine"];
  teams[0].miscommunications = 1;
  teams[1].interceptions = 1;
  teams[0].usedClues = ["wings", "mexico", "night", "iridescent", "wide brim", "silhouette"];

  const ctx: DecryptoContext = {
    variant: "standard",
    timerEnabled: true,
    seed: 7,
    rng,
    humanPlayers: [0, 2],
    aiModels: [null, "decrypto-expert", null, "decrypto-medium"],
    teams,
    round: 3,
    current: [],
    txIdx: 0,
    clueTimerDeadlineTs: null,
    chat: [
      { seat: 1, team: 0, round: 2, text: "iridescent has to be the dragonfly again" },
      { seat: 0, team: 0, round: 2, text: "careful, they intercepted us last round" },
      { seat: 1, team: 0, round: 2, text: "ok going 1-3-4 unless you object" },
    ],
    history: [],
    result: null,
    beats: DEFAULT_BEATS,
  };

  // Two resolved rounds so the note sheet, log, and misread feedback have meat.
  const round = (
    n: number,
    entries: {
      team: 0 | 1;
      code: Code;
      clues: [string, string, string];
      decode: Code;
      intercept?: Code;
    }[],
  ) => {
    const transmissions: Transmission[] = entries.map((e) => ({
      team: e.team,
      encryptor: e.team === 0 ? (n % 2 === 1 ? 0 : 1) : n % 2 === 1 ? 2 : 3,
      code: e.code,
      clues: e.clues,
      skipped: false,
      skipReason: null,
      decodeDraft: [null, null, null],
      interceptDraft: [null, null, null],
      decodeGuess: e.decode,
      interceptGuess: e.intercept ?? null,
      interceptRequired: n > 1,
      resolved: {
        intercepted: n > 1 && e.intercept != null && e.intercept.join() === e.code.join(),
        miscommunicated: e.decode.join() !== e.code.join(),
      },
    }));
    return { round: n, transmissions };
  };

  ctx.history = [
    round(1, [
      { team: 0, code: [1, 3, 4], clues: ["wings", "mexico", "night"], decode: [1, 3, 4] },
      { team: 1, code: [2, 4, 1], clues: ["balloon", "lockdown", "past"], decode: [2, 4, 1] },
    ]),
    round(2, [
      {
        team: 0,
        code: [1, 3, 4],
        clues: ["iridescent", "wide brim", "silhouette"],
        // Misread clue 2 (sombrero → cocktail) AND the enemy intercepted.
        decode: [1, 2, 4],
        intercept: [1, 3, 4],
      },
      { team: 1, code: [3, 1, 2], clues: ["reflection", "scythe", "airship"], decode: [3, 1, 2] },
    ]),
  ];

  ctx.current = buildRoundTransmissions(ctx, 3);
  const white = ctx.current[0] as Transmission;
  const black = ctx.current[1] as Transmission;
  white.code = [3, 1, 4];
  black.code = [2, 3, 1];
  return ctx;
}

interface Scene {
  phase: DecryptoViewPhase;
  seat: number;
  mutate?: (ctx: DecryptoContext) => void;
}

const SCENES: Record<string, Scene> = {
  // Seat 0 writing clues for 3-1-4, timer running against them.
  encrypt: {
    phase: "clueWriting",
    seat: 0,
    mutate: (ctx) => {
      const black = ctx.current[1] as Transmission;
      black.clues = ["orchard", "looking glass", "dirigible"];
      ctx.clueTimerDeadlineTs = Date.now() + 23_000;
    },
  },
  // Seat 1 decoding White's clues with a shared draft in progress.
  decode: {
    phase: "guessing",
    seat: 1,
    mutate: (ctx) => {
      const white = ctx.current[0] as Transmission;
      white.clues = ["naiad", "bitters", "M104 galaxy"];
      white.decodeDraft = [3, null, null];
      const black = ctx.current[1] as Transmission;
      black.clues = ["orchard", "looking glass", "dirigible"];
    },
  },
  // Seat 2 (Black, human) intercepting White's transmission.
  intercept: {
    phase: "guessing",
    seat: 2,
    mutate: (ctx) => {
      const white = ctx.current[0] as Transmission;
      white.clues = ["naiad", "bitters", "M104 galaxy"];
      white.decodeGuess = [3, 1, 4];
      white.interceptDraft = [null, 1, null];
      const black = ctx.current[1] as Transmission;
      black.clues = ["orchard", "looking glass", "dirigible"];
    },
  },
  // Seat 0 (this round's encryptor) locked out while the teams confer.
  waiting: {
    phase: "guessing",
    seat: 0,
    mutate: (ctx) => {
      const white = ctx.current[0] as Transmission;
      white.clues = ["naiad", "bitters", "M104 galaxy"];
      const black = ctx.current[1] as Transmission;
      black.clues = ["orchard", "looking glass", "dirigible"];
    },
  },
  // The bad reveal: own team misread clue 2 AND the enemy intercepted.
  reveal: {
    phase: "reveal",
    seat: 1,
    mutate: (ctx) => {
      const white = ctx.current[0] as Transmission;
      white.clues = ["naiad", "bitters", "M104 galaxy"];
      white.decodeGuess = [3, 2, 4];
      white.interceptGuess = [3, 1, 4];
      const { current, teams } = resolveTransmission(ctx);
      ctx.current = current;
      ctx.teams = teams;
    },
  },
  // AI encryptor failed — skipped transmission reveal.
  skip: {
    phase: "reveal",
    seat: 2,
    mutate: (ctx) => {
      const white = ctx.current[0] as Transmission;
      white.skipped = true;
      white.skipReason = "ai";
      const { current, teams } = resolveTransmission(ctx);
      ctx.current = current;
      ctx.teams = teams;
    },
  },
  gameover: {
    phase: "gameOver",
    seat: 1,
    mutate: (ctx) => {
      ctx.teams[1].interceptions = 2;
      ctx.result = { winner: 1, reason: "interceptions", points: [-1, 2], rounds: 3 };
      ctx.current = [];
    },
  },
};

const PLAYER_NAMES: (string | null)[] = ["Mantas", null, "Aydan", null];

export default function DecryptoPreview() {
  const params = new URLSearchParams(window.location.search);
  // ?frame=WxH — render inside an iframe of that CSS size so a headless
  // browser (500px minimum window width) still lays out a true phone viewport.
  const frame = params.get("frame");
  if (frame) {
    const [w, h] = frame.split("x").map(Number);
    return (
      <iframe
        title="preview-frame"
        src={window.location.pathname + window.location.search.replace(/[?&]frame=[^&]*/, "")}
        style={{ width: w || 390, height: h || 844, border: "1px solid #333" }}
      />
    );
  }

  const sceneName = params.get("scene") ?? "decode";
  const scene = SCENES[sceneName] ?? (SCENES.decode as Scene);
  const ctx = baseCtx();
  scene.mutate?.(ctx);
  const view = buildPlayerView(ctx, scene.phase, scene.seat);

  return (
    <div className="flex h-screen flex-col bg-surface-950">
      {scene.phase === "gameOver" ? (
        <GameOverScreen view={view} onMenu={() => {}} />
      ) : (
        <GameBoard view={view} playerNames={PLAYER_NAMES} onAction={() => {}} error={null} />
      )}
    </div>
  );
}
