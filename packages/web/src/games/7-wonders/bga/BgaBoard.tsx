import type {
  BgaEdificeView,
  BgaPlayerView,
  BgaSpectatorView,
} from "@boardgames/core/games/7-wonders/bga/types";

const CATEGORY_HEX: Record<string, string> = {
  raw: "#92603a",
  man: "#8e9aa5",
  civ: "#3b82f6",
  com: "#d9a520",
  mil: "#dc4b4b",
  sci: "#3fa860",
  gui: "#9d5bc0",
};

const EDIFICE_STATUS: Record<BgaEdificeView["status"], { label: string; cls: string }> = {
  project: { label: "In progress", cls: "border-amber-400/40 bg-amber-400/5" },
  built: { label: "Built", cls: "border-emerald-400/40 bg-emerald-400/5" },
  failed: { label: "Failed", cls: "border-rose-500/40 bg-rose-500/5" },
};

function PlayerCard({ player }: { player: BgaPlayerView }) {
  const military = player.militaryTokens.reduce((a, b) => a + b, 0);
  const sci = player.science;
  const byCategory = new Map<string, string[]>();
  for (const card of player.tableau) {
    byCategory.set(card.category, [...(byCategory.get(card.category) ?? []), card.name]);
  }
  const order = ["raw", "man", "civ", "com", "mil", "sci", "gui", ""];

  return (
    <div className="flex min-w-56 flex-1 flex-col gap-1.5 rounded-lg border border-white/10 bg-surface-900/70 p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold text-fg-primary">{player.name}</span>
        <span className="shrink-0 text-2xs text-fg-secondary">
          {player.wonderName.replace(/^The /, "")} [{player.side}]
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-2xs text-fg-secondary">
        <span>🪙 {player.coins}</span>
        <span>🛡 {player.shields}</span>
        <span className={military < 0 ? "text-rose-400" : "text-emerald-400"}>
          ⚔️ {military >= 0 ? `+${military}` : military}
        </span>
        {(sci.gear > 0 || sci.compass > 0 || sci.tablet > 0 || sci.wild > 0) && (
          <span>
            🔬 {sci.gear}/{sci.compass}/{sci.tablet}
            {sci.wild > 0 ? ` +${sci.wild}?` : ""}
          </span>
        )}
        {player.edificePawns.length > 0 && <span>🏛 {player.edificePawns.join(",")}</span>}
      </div>

      {/* Wonder stage track */}
      <div className="flex gap-1">
        {player.stages.map((stage, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length stage track, never reorders
            key={`stage-${i}`}
            className={`flex-1 rounded border px-1 py-0.5 text-4xs leading-tight ${
              stage.built
                ? "border-amber-400/60 bg-amber-400/10 text-amber-100"
                : "border-white/10 text-fg-disabled"
            }`}
            title={`${stage.cost} → ${stage.effect}`}
          >
            {stage.effect || "—"}
          </div>
        ))}
      </div>

      {/* Tableau grouped by category */}
      <div className="flex flex-col gap-0.5">
        {order
          .filter((cat) => byCategory.has(cat))
          .map((cat) => (
            <div key={cat || "other"} className="flex flex-wrap gap-0.5">
              {(byCategory.get(cat) ?? []).map((name, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: append-only tableau with legit duplicate card names
                  key={`${name}-${i}`}
                  className="rounded border px-1 py-px text-4xs leading-tight text-fg-primary"
                  style={{ borderColor: `${CATEGORY_HEX[cat] ?? "#666"}90` }}
                  title={name}
                >
                  {name}
                </span>
              ))}
            </div>
          ))}
        {player.tableau.length === 0 && (
          <span className="text-4xs italic text-fg-disabled">no cards yet</span>
        )}
      </div>
    </div>
  );
}

function EdificeCard({ edifice }: { edifice: BgaEdificeView }) {
  const status = EDIFICE_STATUS[edifice.status];
  return (
    <div className={`flex min-w-48 flex-1 flex-col gap-1 rounded-lg border p-2 ${status.cls}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-fg-primary">
          Age {edifice.slot}: {edifice.name}
        </span>
        <span className="shrink-0 text-4xs uppercase tracking-wide text-fg-secondary">
          {status.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-2 text-4xs text-fg-secondary">
        <span>
          <span className="text-emerald-300">Reward:</span> {edifice.reward}
        </span>
        <span>
          <span className="text-rose-300">Penalty:</span> {edifice.penalty}
        </span>
      </div>
      {edifice.status === "project" && (
        <span className="text-4xs text-fg-disabled">{edifice.tokensLeft} pawns left</span>
      )}
      {edifice.participants.length > 0 && (
        <span className="text-4xs text-fg-secondary">
          Participants: {edifice.participants.join(", ")}
        </span>
      )}
    </div>
  );
}

export default function BgaBoard({ view }: { view: BgaSpectatorView }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-fg-primary">
        Age {view.age} · Turn {Math.min(view.turn, 6)}/6 · 🗑️ {view.discardCount}
        {view.finished && <span className="ml-2 text-emerald-400">· game over</span>}
      </p>

      {view.edifices.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {view.edifices.map((edifice) => (
            <EdificeCard key={edifice.slot} edifice={edifice} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {view.players.map((player) => (
          <PlayerCard key={player.id} player={player} />
        ))}
      </div>
    </div>
  );
}
