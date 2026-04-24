import { useState } from "react";
import { CardDeck } from "../components/CardDeck";

// ---------------------------------------------------------------------------
// Sample card backs
// ---------------------------------------------------------------------------

function ClassicBack({ className }: { className: string }) {
  return (
    <div
      className={`${className} flex items-center justify-center border border-gray-600 bg-gradient-to-br from-indigo-900 to-indigo-950`}
    >
      <div className="flex h-[70%] w-[70%] items-center justify-center rounded-sm border border-indigo-400/20 bg-indigo-800/30">
        <span className="text-lg text-indigo-400/50">&spades;</span>
      </div>
    </div>
  );
}

function OrnateBack({ className }: { className: string }) {
  return (
    <div
      className={`${className} flex items-center justify-center border border-amber-800/60 bg-gradient-to-br from-red-950 to-red-900`}
    >
      <div className="flex h-[70%] w-[70%] items-center justify-center rounded-sm border border-amber-500/20 bg-amber-900/20">
        <span className="text-lg text-amber-400/60">&diams;</span>
      </div>
    </div>
  );
}

function MinimalBack({ className }: { className: string }) {
  return (
    <div
      className={`${className} flex items-center justify-center border border-emerald-800/50 bg-gradient-to-br from-emerald-950 to-emerald-900`}
    >
      <div className="flex h-[70%] w-[70%] items-center justify-center rounded-sm border border-emerald-500/15 bg-emerald-800/20">
        <span className="text-lg text-emerald-400/50">&clubs;</span>
      </div>
    </div>
  );
}

function SampleTrumpCard({ className }: { className: string }) {
  return (
    <div
      className={`${className} flex flex-col items-center justify-center border border-gray-500 bg-white`}
    >
      <span className="text-xs font-bold text-red-500">&hearts;</span>
      <span className="text-sm font-extrabold text-gray-800">7</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backs registry
// ---------------------------------------------------------------------------

const BACKS = [
  { name: "Classic", render: (cls: string) => <ClassicBack className={cls} /> },
  { name: "Ornate", render: (cls: string) => <OrnateBack className={cls} /> },
  { name: "Minimal", render: (cls: string) => <MinimalBack className={cls} /> },
];

// ---------------------------------------------------------------------------
// Preview page
// ---------------------------------------------------------------------------

export default function DeckPreview() {
  const [count, setCount] = useState(24);
  const [showTrump, setShowTrump] = useState(true);
  const [isGlowing, setIsGlowing] = useState(false);
  const [backIndex, setBackIndex] = useState(0);

  const back = BACKS[backIndex];

  return (
    <div className="flex min-h-screen flex-col bg-surface-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight">CardDeck Preview</h1>
        <p className="mt-1 text-sm text-gray-500">Reusable card deck component for all games</p>
      </div>

      <div className="flex flex-1 flex-col gap-8 p-6 lg:flex-row lg:p-10">
        {/* Controls panel */}
        <div className="w-full space-y-6 lg:w-64 lg:shrink-0">
          {/* Card count */}
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">
              Cards remaining
            </span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={36}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="flex-1 accent-indigo-500"
              />
              <span className="w-8 text-right text-sm font-bold tabular-nums">{count}</span>
            </div>
            {/* Quick presets */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[0, 1, 2, 3, 4, 5, 10, 24, 36].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                    count === n
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Trump toggle */}
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">
              Trump card
            </span>
            <button
              type="button"
              onClick={() => setShowTrump(!showTrump)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                showTrump
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {showTrump ? "Showing" : "Hidden"}
            </button>
          </div>

          {/* Glow toggle */}
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">
              Glow (selected)
            </span>
            <button
              type="button"
              onClick={() => setIsGlowing(!isGlowing)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                isGlowing
                  ? "bg-amber-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {isGlowing ? "Glowing" : "Off"}
            </button>
          </div>

          {/* Back style */}
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">
              Card back style
            </span>
            <div className="flex gap-2">
              {BACKS.map((b, i) => (
                <button
                  key={b.name}
                  type="button"
                  onClick={() => setBackIndex(i)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    backIndex === i
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Preview area */}
        <div className="flex flex-1 flex-col gap-10">
          {/* All sizes side by side */}
          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
              All sizes
            </h2>
            <div className="flex items-end gap-10 rounded-xl border border-gray-800 bg-gray-900/50 p-8">
              {(["sm", "md", "lg"] as const).map((sz) => (
                <div key={sz} className="flex flex-col items-center gap-3">
                  <CardDeck
                    count={count}
                    size={sz}
                    renderBack={back.render}
                    glowing={isGlowing}
                    trump={
                      showTrump
                        ? { render: (cls) => <SampleTrumpCard className={cls} /> }
                        : undefined
                    }
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    {sz}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Low count gallery */}
          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Low count visualization (0-6)
            </h2>
            <div className="flex items-end gap-6 rounded-xl border border-gray-800 bg-gray-900/50 p-8">
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="flex flex-col items-center gap-3">
                  <CardDeck
                    count={n}
                    size="md"
                    renderBack={back.render}
                    trump={
                      showTrump
                        ? { render: (cls) => <SampleTrumpCard className={cls} /> }
                        : undefined
                    }
                  />
                  <span className="text-xs font-bold tabular-nums text-gray-400">{n}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Without trump */}
          <div>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
              Without trump (Lost Cities style)
            </h2>
            <div className="flex items-end gap-6 rounded-xl border border-gray-800 bg-gray-900/50 p-8">
              {[1, 5, 15, 30].map((n) => (
                <div key={n} className="flex flex-col items-center gap-3">
                  <CardDeck count={n} size="md" renderBack={back.render} />
                  <span className="text-xs font-bold tabular-nums text-gray-400">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
