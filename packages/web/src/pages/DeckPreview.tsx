import { useState } from "react";
import { CardDeck } from "../components/CardDeck";
import { Chip } from "../components/ui/Chip";
import { LABEL_CLS } from "../components/ui/Field";
import { PageMain, PageShell } from "../components/ui/PageShell";
import { Section } from "../components/ui/Section";
import { Surface } from "../components/ui/Surface";

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
      <span className="text-sm font-extrabold text-fg-disabled">7</span>
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
    <PageShell background="plain">
      <PageMain width="full" padding="none" className="flex flex-1 flex-col text-white">
        <div className="border-b border-white/10 px-6 py-4">
          <h1 className="text-xl font-bold tracking-tight">CardDeck Preview</h1>
          <p className="mt-1 text-sm text-fg-muted">Reusable card deck component for all games</p>
        </div>

        <div className="flex flex-1 flex-col gap-8 p-6 lg:flex-row lg:p-10">
          {/* Controls panel */}
          <div className="w-full space-y-6 lg:w-64 lg:shrink-0">
            {/* Card count */}
            <div>
              <span className={`mb-2 block ${LABEL_CLS}`}>Cards remaining</span>
              <div className="flex items-center gap-3">
                {/* biome-ignore lint/correctness/noRestrictedElements: range slider — no ui Slider primitive exists (2 call sites app-wide) */}
                <input
                  type="range"
                  min={0}
                  max={36}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="flex-1 accent-accent-500"
                />
                <span className="w-8 text-right text-sm font-bold tabular-nums">{count}</span>
              </div>
              {/* Quick presets */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[0, 1, 2, 3, 4, 5, 10, 24, 36].map((n) => (
                  <Chip
                    key={n}
                    pressed={count === n}
                    tone="accent"
                    size="xs"
                    flat
                    onClick={() => setCount(n)}
                  >
                    {n}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Trump toggle */}
            <div>
              <span className={`mb-2 block ${LABEL_CLS}`}>Trump card</span>
              <Chip
                pressed={showTrump}
                tone="accent"
                size="md"
                flat
                onClick={() => setShowTrump(!showTrump)}
              >
                {showTrump ? "Showing" : "Hidden"}
              </Chip>
            </div>

            {/* Glow toggle */}
            <div>
              <span className={`mb-2 block ${LABEL_CLS}`}>Glow (selected)</span>
              <Chip
                pressed={isGlowing}
                tone="amber"
                size="md"
                flat
                onClick={() => setIsGlowing(!isGlowing)}
              >
                {isGlowing ? "Glowing" : "Off"}
              </Chip>
            </div>

            {/* Back style */}
            <div>
              <span className={`mb-2 block ${LABEL_CLS}`}>Card back style</span>
              <div className="flex gap-2">
                {BACKS.map((b, i) => (
                  <Chip
                    key={b.name}
                    pressed={backIndex === i}
                    tone="accent"
                    size="sm"
                    flat
                    onClick={() => setBackIndex(i)}
                  >
                    {b.name}
                  </Chip>
                ))}
              </div>
            </div>
          </div>

          {/* Preview area */}
          <div className="flex flex-1 flex-col gap-10">
            {/* All sizes side by side */}
            <Section title="All sizes">
              <Surface
                radius="xl"
                padding="none"
                className="flex items-end gap-10 bg-surface-900/50 p-8"
              >
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
                    <span className="text-3xs font-semibold uppercase tracking-label text-fg-muted">
                      {sz}
                    </span>
                  </div>
                ))}
              </Surface>
            </Section>

            {/* Low count gallery */}
            <Section title="Low count visualization (0-6)">
              <Surface
                radius="xl"
                padding="none"
                className="flex items-end gap-6 bg-surface-900/50 p-8"
              >
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
                    <span className="text-xs font-bold tabular-nums text-fg-secondary">{n}</span>
                  </div>
                ))}
              </Surface>
            </Section>

            {/* Without trump */}
            <Section title="Without trump (Lost Cities style)">
              <Surface
                radius="xl"
                padding="none"
                className="flex items-end gap-6 bg-surface-900/50 p-8"
              >
                {[1, 5, 15, 30].map((n) => (
                  <div key={n} className="flex flex-col items-center gap-3">
                    <CardDeck count={n} size="md" renderBack={back.render} />
                    <span className="text-xs font-bold tabular-nums text-fg-secondary">{n}</span>
                  </div>
                ))}
              </Surface>
            </Section>
          </div>
        </div>
      </PageMain>
    </PageShell>
  );
}
