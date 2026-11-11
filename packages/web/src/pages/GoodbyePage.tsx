import "@fontsource/cinzel/600.css";
import type { Memorial } from "@boardgames/core/protocol";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { GOODBYE_PARAGRAPHS, GOODBYE_SIGNOFF, GOODBYE_TITLE } from "./goodbye-copy";

// The goodbye screen: the whole site while it hibernates. One illustration,
// one farewell, the group's totals frozen at the moment it went to sleep, and
// — only for members who may still play online — one way through.

// The illustration (PROMPTS.md, "Site — goodbye"): optional until generated,
// so the page stands on its own gradient without it.
const art = import.meta.glob<string>("../assets/goodbye/*.webp", {
  eager: true,
  import: "default",
});
const WIDE = art["../assets/goodbye/goodbye-wide.webp"];
const TALL = art["../assets/goodbye/goodbye-tall.webp"];

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

function monthOf(dateKey: string | null): string | null {
  if (!dateKey) return null;
  const d = new Date(`${dateKey}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : MONTH.format(d);
}

function memorialLine(m: Memorial): string[] {
  const parts: string[] = [];
  if (m.nights > 0) parts.push(`${m.nights} game ${m.nights === 1 ? "night" : "nights"}`);
  if (m.matches > 0) parts.push(`${m.matches} games recorded`);
  if (m.onlineGames > 0) parts.push(`${m.onlineGames} played online`);
  const from = monthOf(m.firstNight);
  const to = monthOf(m.lastNight);
  if (from && to) parts.push(from === to ? from : `${from} – ${to}`);
  return parts;
}

export interface GoodbyePageProps {
  memorial: Memorial | null;
  /** Show the way into the online games. */
  onlineAccess: boolean;
  /** Also show the way into the admin console. */
  admin: boolean;
  /** The admin's preview while the site is still awake. */
  preview?: boolean;
}

export default function GoodbyePage({ memorial, onlineAccess, admin, preview }: GoodbyePageProps) {
  const navigate = useNavigate();
  const line = memorial ? memorialLine(memorial) : [];

  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-x-hidden bg-surface-950 text-fg-primary">
      {preview && (
        <p className="z-raised w-full bg-amber-500/15 px-4 py-2 text-center text-xs text-amber-200">
          Preview — the site is awake. This is what everyone will see once it hibernates.
        </p>
      )}

      <div className="relative w-full max-w-5xl">
        {WIDE || TALL ? (
          <picture>
            {TALL && <source media="(max-width: 640px)" srcSet={TALL} />}
            <img
              src={WIDE ?? TALL}
              alt="An empty game table at dusk, the last game still laid out"
              className="aspect-[9/14] w-full object-cover sm:aspect-video"
            />
          </picture>
        ) : (
          <div
            aria-hidden="true"
            className="aspect-[9/10] w-full sm:aspect-[21/9]"
            style={{
              background:
                "radial-gradient(60% 70% at 50% 85%, color-mix(in srgb, var(--color-accent-500) 30%, transparent) 0%, transparent 70%)",
            }}
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface-950" />
      </div>

      <article className="relative -mt-24 flex w-full max-w-xl flex-col gap-5 px-4 pb-16 sm:-mt-32">
        <PageHeader
          size="lg"
          align="center"
          title={<span className="text-balance font-fantasy font-semibold">{GOODBYE_TITLE}</span>}
        />
        <div className="flex flex-col gap-4 text-pretty text-base leading-relaxed text-fg-secondary sm:text-lg">
          {GOODBYE_PARAGRAPHS.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <p className="text-right font-fantasy text-sm text-fg-muted">{GOODBYE_SIGNOFF}</p>

        {line.length > 0 && (
          <p className="mt-4 border-t border-line-soft pt-4 text-center text-xs text-fg-muted">
            {line.join(" · ")}
          </p>
        )}

        {(onlineAccess || admin) && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {onlineAccess && (
              <Button variant="secondary" size="sm" onClick={() => navigate("/games")}>
                Continue to the online games
              </Button>
            )}
            {admin && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin?tab=site")}>
                Admin console
              </Button>
            )}
          </div>
        )}
      </article>
    </main>
  );
}
