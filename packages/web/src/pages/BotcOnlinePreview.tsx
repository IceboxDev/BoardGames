import { BotcConfigSchema } from "@boardgames/core/games/blood-on-the-clocktower/manifest";
import type {
  OnlineAction,
  PlayerAction,
} from "@boardgames/core/games/blood-on-the-clocktower/online/actions";
import { applyOnline, tickVote } from "@boardgames/core/games/blood-on-the-clocktower/online/apply";
import { createOnlineGame } from "@boardgames/core/games/blood-on-the-clocktower/online/create";
import type { BotcOnline } from "@boardgames/core/games/blood-on-the-clocktower/online/state";
import { viewFor } from "@boardgames/core/games/blood-on-the-clocktower/online/view";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Select } from "../components/ui";
import {
  type BotcOnlineApi,
  BotcOnlineContext,
  type StAction,
  stamp,
} from "../games/blood-on-the-clocktower/online/context";
import { PlayerScreen } from "../games/blood-on-the-clocktower/online/player/PlayerScreen";
import { StorytellerScreen } from "../games/blood-on-the-clocktower/online/storyteller/StorytellerScreen";

// Dev-only hot-seat sandbox for the online Clocktower game: the real
// reducer (`applyOnline`) runs in the page, and the bar on top switches whose
// screen you're looking at — the Storyteller's or any player's — so one
// browser can play a whole game and check what each seat may see.
//   /dev/botc-online?players=8&edition=bad-moon-rising&seed=3&scene=day
// Scenes jump ahead: setup (default) | reveal | night | day | over.

const SCENES = ["setup", "reveal", "night", "day", "over"] as const;
type Scene = (typeof SCENES)[number];

function run(game: BotcOnline, seat: number, action: OnlineAction): BotcOnline {
  const r = applyOnline(game, seat, action, Date.now());
  if (!r.ok) throw new Error(`${action.kind}: ${r.reason}`);
  return r.game;
}

function st(game: BotcOnline, action: StAction): BotcOnline {
  return run(game, 0, stamp(action, game.rev));
}

function build(players: number, edition: string, seed: number, scene: Scene): BotcOnline {
  let game = createOnlineGame({
    names: [
      "Storyteller",
      ...[
        "Ann",
        "Ben",
        "Cid",
        "Dee",
        "Eve",
        "Fin",
        "Gus",
        "Hal",
        "Ivy",
        "Jo",
        "Kai",
        "Lu",
        "Mo",
        "Ned",
        "Oz",
      ].slice(0, players),
    ],
    config: BotcConfigSchema.parse({ edition }),
    seed,
  });
  if (scene === "setup") return game;
  game = st(game, { kind: "deal" });
  if (scene === "reveal") return game;
  game = st(game, { kind: "reveal-characters" });
  for (let s = 1; s <= players; s++) {
    game = run(game, s, { kind: "ack-character" });
    for (const d of game.inbox[s] ?? []) game = run(game, s, { kind: "dismiss-info", id: d.id });
  }
  game = st(game, { kind: "begin-night" });
  if (scene === "night") return game;
  game = st(game, { kind: "dawn" });
  game = st(game, { kind: "nominations", open: true });
  game = run(game, 1, { kind: "chat", text: "I'm the Chef and I got a 1." });
  game = run(game, 2, { kind: "whisper", to: 3, text: "Don't trust Ann." });
  if (scene === "day") return game;
  return st(game, { kind: "end-game", winner: "good", reason: "the preview ended it" });
}

export default function BotcOnlinePreview() {
  const [params] = useSearchParams();
  const players = Math.min(15, Math.max(5, Number(params.get("players") ?? 7)));
  const edition =
    params.get("edition") === "bad-moon-rising" ? "bad-moon-rising" : "trouble-brewing";
  const seed = Number(params.get("seed") ?? 1);
  const scene = SCENES.find((s) => s === params.get("scene")) ?? "setup";
  const [game, setGame] = useState(() => build(players, edition, seed, scene));
  const [seat, setSeat] = useState(Number(params.get("seat") ?? 0));
  const [error, setError] = useState<string | null>(null);

  // The vote clock: tick like the server's timer would.
  useEffect(() => {
    const id = setInterval(() => setGame((g) => tickVote(g, Date.now())), 250);
    return () => clearInterval(id);
  }, []);

  const api = useMemo((): BotcOnlineApi => {
    const view = viewFor(game, seat);
    const apply = (action: OnlineAction) => {
      const r = applyOnline(game, seat, action, Date.now());
      if (r.ok) {
        setGame(r.game);
        setError(null);
      } else setError(r.reason);
    };
    return {
      view,
      act: (action: PlayerAction) => apply(action),
      st: (action: StAction) => apply(stamp(action, game.rev)),
      error,
      endActions: [],
    };
  }, [game, seat, error]);

  return (
    <div className="flex h-screen flex-col bg-surface-950">
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-1.5 text-xs text-fg-secondary">
        <span className="font-bold text-amber-300">Clocktower sandbox</span>
        <span className="flex items-center gap-2">
          Viewing as
          <Select
            size="sm"
            block={false}
            aria-label="Viewing as"
            value={String(seat)}
            onChange={(e) => setSeat(Number(e.target.value))}
          >
            {game.names.map((n, i) => (
              <option key={n} value={i}>
                {i === 0 ? `${n} (Storyteller)` : n}
              </option>
            ))}
          </Select>
        </span>
        <span>rev {game.rev}</span>
      </div>
      <BotcOnlineContext.Provider value={api}>
        {api.view.role === "storyteller" ? <StorytellerScreen /> : <PlayerScreen />}
      </BotcOnlineContext.Provider>
    </div>
  );
}
