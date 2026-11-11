import "@fontsource/cinzel/600.css";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { useCurrentUser } from "../hooks/useCurrentUser.ts";
import { firstNameOf, GOODBYE_AFTER, GOODBYE_TITLE, goodbyeLine } from "./goodbye-copy";

// The goodbye screen: the whole site while it hibernates. One farewell
// figure, two lines and — only for members who may still play online — one
// way through.

// The figure (PROMPTS.md, "Site — goodbye screen"): a transparent PNG run
// through `card-art --game=goodbye`; optional, the page stands without it.
const art = import.meta.glob<string>("../assets/goodbye/goodbye.webp", {
  eager: true,
  import: "default",
});
const FIGURE = art["../assets/goodbye/goodbye.webp"];

export interface GoodbyePageProps {
  /** Show the way into the online games. */
  onlineAccess: boolean;
  /** Also show the way into the admin console. */
  admin: boolean;
  /** The admin's preview while the site is still awake. */
  preview?: boolean;
}

export default function GoodbyePage({ onlineAccess, admin, preview }: GoodbyePageProps) {
  const navigate = useNavigate();
  const { user } = useCurrentUser();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center overflow-x-hidden bg-surface-950 text-fg-primary">
      {preview && (
        <p className="fixed inset-x-0 top-0 z-raised bg-amber-500/15 px-4 py-2 text-center text-xs text-amber-200">
          Preview — the site is awake. This is what everyone will see once it hibernates.
        </p>
      )}

      {FIGURE && (
        <img
          src={FIGURE}
          alt="A sad white rabbit in a red padded suit holding a black cat and waving goodbye"
          className="h-56 w-auto object-contain sm:h-72"
          draggable={false}
        />
      )}

      <article className="flex w-full max-w-2xl flex-col gap-3 px-4 py-10 text-center">
        <PageHeader
          size="lg"
          align="center"
          title={<span className="text-balance font-fantasy font-semibold">{GOODBYE_TITLE}</span>}
        />
        <p className="text-pretty text-base text-fg-secondary sm:text-lg">
          {goodbyeLine(firstNameOf(user?.name))}
        </p>
        <p className="text-sm text-fg-muted">{GOODBYE_AFTER}</p>

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
