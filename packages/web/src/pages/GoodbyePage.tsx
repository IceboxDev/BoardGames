import "@fontsource/cinzel/600.css";
import type { Memorial } from "@boardgames/core/protocol";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { GOODBYE_LINE, GOODBYE_SIGNOFF, GOODBYE_TITLE } from "./goodbye-copy";

// The goodbye screen: the whole site while it hibernates. One farewell
// figure, two lines, the group's totals frozen at the moment it went to sleep,
// and — only for members who may still play online — one way through.

// The figure (PROMPTS.md, "Site — goodbye screen"): a transparent PNG,
// optional until generated — the page stands without it.
const art = import.meta.glob<string>("../assets/goodbye/goodbye.webp", {
  eager: true,
  import: "default",
});
const FIGURE = art["../assets/goodbye/goodbye.webp"];

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
    <main className="flex min-h-dvh flex-col items-center justify-center overflow-x-hidden bg-surface-950 text-fg-primary">
      {preview && (
        <p className="fixed inset-x-0 top-0 z-raised bg-amber-500/15 px-4 py-2 text-center text-xs text-amber-200">
          Preview — the site is awake. This is what everyone will see once it hibernates.
        </p>
      )}

      {FIGURE && (
        <img src={FIGURE} alt="" className="h-56 w-auto object-contain sm:h-72" draggable={false} />
      )}

      <article className="flex w-full max-w-2xl flex-col gap-3 px-4 py-10 text-center">
        <PageHeader
          size="lg"
          align="center"
          title={<span className="text-balance font-fantasy font-semibold">{GOODBYE_TITLE}</span>}
        />
        <p className="text-pretty text-base text-fg-secondary sm:text-lg">{GOODBYE_LINE}</p>
        <p className="font-fantasy text-sm text-fg-muted">{GOODBYE_SIGNOFF}</p>

        {line.length > 0 && <p className="mt-4 text-xs text-fg-muted">{line.join(" · ")}</p>}

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
