import type { Campaign, DndNode } from "@boardgames/core/protocol";
import { ChevronRightIcon } from "../../../components/icons";
import { D20Die } from "../../../components/offline/D20Die";
import { Button } from "../../../components/ui";

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
};

export function StoryTree({ campaign, nodes, waypointIndex, path, onEnterNode, onJumpTo }: Props) {
  const waypoint = campaign.checkpoints[waypointIndex];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain = path.map((id) => byId.get(id)).filter((n): n is DndNode => !!n);
  const current = chain.at(-1) ?? null;

  const children = nodes.filter(
    (n) => n.waypointIndex === waypointIndex && n.parentId === (current?.id ?? null),
  );

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
      {current ? (
        <div className="shrink-0 rounded-2xl border border-amber-400/25 bg-gradient-to-br from-[#2a0808]/80 via-surface-900/85 to-black/80 p-4">
          <p
            className="text-3xs font-bold uppercase tracking-[0.3em] text-amber-300/70"
            style={SERIF}
          >
            Read aloud
          </p>
          <p
            className="mt-2 whitespace-pre-line text-base leading-relaxed text-amber-100/90"
            style={SERIF}
          >
            {current.readText}
          </p>
        </div>
      ) : waypoint?.arrivalText ? (
        <div className="shrink-0 rounded-2xl border border-amber-400/25 bg-gradient-to-br from-[#2a0808]/80 via-surface-900/85 to-black/80 p-4">
          <p
            className="text-3xs font-bold uppercase tracking-[0.3em] text-amber-300/70"
            style={SERIF}
          >
            Read aloud — on arrival
          </p>
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

      {/* Branches. */}
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
                onClick={() => onEnterNode(node.id)}
                className="flex h-full w-full flex-col gap-1.5 rounded-2xl border border-amber-400/20 bg-gradient-to-br from-[#2a0808]/80 via-surface-900/90 to-black/80 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-amber-400/45"
              >
                <span className="font-fantasy text-sm font-bold leading-snug text-amber-100">
                  {node.trigger}
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
    </div>
  );
}
