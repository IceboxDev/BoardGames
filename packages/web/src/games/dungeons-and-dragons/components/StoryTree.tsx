import type { Campaign, DndCharacter, DndNode, DndNpc } from "@boardgames/core/protocol";
import { ChevronRightIcon } from "../../../components/icons";
import { D20Die } from "../../../components/offline/D20Die";
import { Button } from "../../../components/ui";
import { type InitiativeOrder, InitiativePanel } from "./InitiativePanel";
import { RestPanel } from "./RestPanel";

/** Chain-link glyph for nodes that converge into a parallel branch. */
function ChainIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// The main game screen's core: the story tree inside a waypoint "folder".
// Waypoint view shows the roots of every tree charted there; entering a node
// shows the text the DM reads aloud plus the child branches — each child card
// leads with its trigger (what the players could do) and a one-line summary,
// and the full narration reveals only on traversal.

const SERIF = { fontFamily: "ui-serif, Georgia, serif" } as const;

type Props = {
  campaign: Campaign;
  nodes: DndNode[];
  waypointIndex: number;
  /** Node ids from root to the current node; empty = waypoint view. */
  path: string[];
  onEnterNode: (nodeId: string) => void;
  /** Jump up the breadcrumb: -1 = waypoint view, otherwise index into path. */
  onJumpTo: (pathIndex: number) => void;
  /** Chain-link traversal: replace the whole path (root → target ids). */
  onJumpToNode: (pathIds: string[]) => void;
  /** Short-rest bookkeeping → chronicle. */
  onLogRest: (text: string) => void;
  /** For the initiative tracker: the party's PCs and the campaign's cast. */
  party: DndCharacter[];
  npcs: DndNpc[];
  /** Initiative tracker → game screen: loggable turn-order summary. */
  onOrderChange?: (order: InitiativeOrder | null) => void;
  /** History logging: mark a spoken text as read to the party. */
  onLogCurrent: () => void;
  currentLogged: boolean;
  onLogArrival: () => void;
  arrivalLogged: boolean;
  logPending: boolean;
};

export function StoryTree({
  campaign,
  nodes,
  waypointIndex,
  path,
  onEnterNode,
  onJumpTo,
  onJumpToNode,
  onLogRest,
  party,
  npcs,
  onOrderChange,
  onLogCurrent,
  currentLogged,
  onLogArrival,
  arrivalLogged,
  logPending,
}: Props) {
  const waypoint = campaign.checkpoints[waypointIndex];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain = path.map((id) => byId.get(id)).filter((n): n is DndNode => !!n);
  const current = chain.at(-1) ?? null;

  const children = nodes.filter(
    (n) => n.waypointIndex === waypointIndex && n.parentId === (current?.id ?? null),
  );

  // A chain-link tile doesn't open its own node — it jumps to the target's
  // branch (root → target), "ending" this one.
  const enter = (node: DndNode) => {
    if (node.linkTargetId && byId.has(node.linkTargetId)) {
      const ids: string[] = [];
      for (
        let cur: DndNode | null = byId.get(node.linkTargetId) ?? null;
        cur;
        cur = cur.parentId ? (byId.get(cur.parentId) ?? null) : null
      ) {
        ids.unshift(cur.id);
      }
      onJumpToNode(ids);
      return;
    }
    onEnterNode(node.id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
      {/* Breadcrumb: waypoint › trigger › trigger › … */}
      <nav className="flex flex-wrap items-center gap-1 text-2xs">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onJumpTo(-1)}
          disabled={path.length === 0}
          className={`font-fantasy font-bold uppercase tracking-[0.14em] ${
            path.length === 0 ? "text-amber-100" : "text-amber-300/60 hover:text-amber-100"
          }`}
        >
          {waypoint?.title ?? "Waypoint"}
        </Button>
        {chain.map((node, i) => (
          <span key={node.id} className="flex items-center gap-1">
            <ChevronRightIcon className="h-3 w-3 text-amber-300/40" />
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onJumpTo(i)}
              disabled={i === chain.length - 1}
              className={
                i === chain.length - 1
                  ? "max-w-56 truncate text-amber-100"
                  : "max-w-56 truncate text-amber-300/60 hover:text-amber-100"
              }
            >
              {node.trigger}
            </Button>
          </span>
        ))}
      </nav>

      {/* Read-aloud panel: the current node's narration, or — at the waypoint
          level — the arrival narration the DM reads when the party gets here.
          Same treatment for both: a waypoint header is read to the players
          exactly like a node. */}
      {current?.nodeType === "initiative" ? (
        <InitiativePanel node={current} party={party} npcs={npcs} onOrderChange={onOrderChange} />
      ) : current ? (
        <div className="shrink-0 rounded-2xl border border-amber-400/25 bg-gradient-to-br from-[#2a0808]/80 via-surface-900/85 to-black/80 p-4">
          <div className="flex items-center justify-between gap-2">
            <p
              className="text-3xs font-bold uppercase tracking-[0.3em] text-amber-300/70"
              style={SERIF}
            >
              Read aloud
            </p>
            <Button
              variant={currentLogged ? "ghost" : "tinted"}
              tone="amber"
              size="xs"
              disabled={currentLogged}
              loading={logPending}
              onClick={onLogCurrent}
            >
              {currentLogged ? "Logged ✓" : "Log"}
            </Button>
          </div>
          <p
            className="mt-2 whitespace-pre-line text-base leading-relaxed text-amber-100/90"
            style={SERIF}
          >
            {current.readText}
          </p>
        </div>
      ) : waypoint?.arrivalText ? (
        <div className="shrink-0 rounded-2xl border border-amber-400/25 bg-gradient-to-br from-[#2a0808]/80 via-surface-900/85 to-black/80 p-4">
          <div className="flex items-center justify-between gap-2">
            <p
              className="text-3xs font-bold uppercase tracking-[0.3em] text-amber-300/70"
              style={SERIF}
            >
              Read aloud — on arrival
            </p>
            <Button
              variant={arrivalLogged ? "ghost" : "tinted"}
              tone="amber"
              size="xs"
              disabled={arrivalLogged}
              loading={logPending}
              onClick={onLogArrival}
            >
              {arrivalLogged ? "Logged ✓" : "Log"}
            </Button>
          </div>
          <p
            className="mt-2 whitespace-pre-line text-base leading-relaxed text-amber-100/90"
            style={SERIF}
          >
            {waypoint.arrivalText}
          </p>
        </div>
      ) : (
        waypoint && (
          <div className="shrink-0 rounded-2xl border border-amber-400/15 bg-black/25 px-4 py-3">
            <p className="text-sm leading-relaxed text-amber-200/70" style={SERIF}>
              {waypoint.description}
            </p>
          </div>
        )
      )}

      {current?.nodeType === "rest" && (
        <RestPanel party={party} onLog={onLogRest} logPending={logPending} />
      )}

      {/* Branches (an initiative node has no story branches — the tracker
          above IS the node; combat resolution lands in a later slice). */}
      {current?.nodeType === "initiative" ? null : (
        <>
          <p
            className="px-1 text-3xs font-bold uppercase tracking-[0.25em] text-amber-300/50"
            style={SERIF}
          >
            {current ? "The paths from here" : "Charted beginnings"}
          </p>
          {children.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 opacity-70">
              <span aria-hidden="true">
                <D20Die count={20} className="dnd-die h-12 w-12" />
              </span>
              <p className="max-w-sm text-center text-xs leading-relaxed text-amber-200/50">
                {current
                  ? "No paths charted from here yet. Tell the sages below what the players do next."
                  : "Nothing charted at this waypoint yet. Tell the sages below what the players do as they arrive."}
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 2xl:grid-cols-3">
              {children.map((node) => (
                <li key={node.id}>
                  {/* biome-ignore lint/correctness/noRestrictedElements: full-card click target — a story branch tile; Button/Chip chrome doesn't fit. */}
                  <button
                    type="button"
                    onClick={() => enter(node)}
                    className={`flex h-full w-full flex-col gap-1.5 rounded-2xl border p-3.5 text-left transition-all hover:-translate-y-0.5 ${
                      node.nodeType === "initiative"
                        ? "border-rose-400/40 bg-gradient-to-br from-[#3a0a0a]/90 via-surface-900/90 to-black/80 hover:border-rose-300/60"
                        : "border-amber-400/20 bg-gradient-to-br from-[#2a0808]/80 via-surface-900/90 to-black/80 hover:border-amber-400/45"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {node.nodeType === "initiative" && (
                        <span aria-hidden="true" className="shrink-0">
                          <D20Die count={20} className="h-5 w-5" />
                        </span>
                      )}
                      <span
                        className={`font-fantasy text-sm font-bold leading-snug ${
                          node.nodeType === "initiative" ? "text-rose-100" : "text-amber-100"
                        }`}
                      >
                        {node.trigger}
                      </span>
                      {node.nodeType === "initiative" && (
                        <span className="ml-auto shrink-0 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-[0.12em] text-rose-200/80 ring-1 ring-rose-400/30">
                          Combat
                        </span>
                      )}
                      {node.nodeType === "rest" && (
                        <span className="ml-auto shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-[0.12em] text-emerald-200/80 ring-1 ring-emerald-400/30">
                          Rest
                        </span>
                      )}
                      {node.linkTargetId && (
                        <span
                          className="ml-auto shrink-0 text-amber-300/70"
                          title="Leads to an existing branch"
                        >
                          <ChainIcon className="h-4 w-4" />
                        </span>
                      )}
                    </span>
                    {node.summary && (
                      <span className="text-xs leading-relaxed text-amber-200/60" style={SERIF}>
                        {node.summary}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
