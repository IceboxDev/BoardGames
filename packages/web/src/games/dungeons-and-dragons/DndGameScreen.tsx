import type { Campaign, DndNpc, DndParty, ResolveTurnResponse } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { GameScreen } from "../../components/game-layout";
import { BookIcon } from "../../components/icons";
import { D20Die } from "../../components/offline/D20Die";
import { Button, EmptyState, LoadingState } from "../../components/ui";
import {
  activeCombatQueryFn,
  advanceCombat,
  appendHistoryEntries,
  charactersQueryFn,
  createDndSession,
  endCombat,
  fileContentUrl,
  filesQueryFn,
  generateNode,
  historyQueryFn,
  nodesQueryFn,
  npcsQueryFn,
  resolveTurn,
  retriggerNpcs,
  startCombat,
} from "../../lib/dnd-campaigns";
import { errorMessageOf } from "../../lib/error-message";
import { qk } from "../../lib/query-keys";
import { CharacterSheetModal } from "./components/CharacterSheetModal";
import { CombatPanel } from "./components/CombatPanel";
import { HistoryLog } from "./components/HistoryLog";
import type { InitiativeOrder } from "./components/InitiativePanel";
import { NpcSheetModal } from "./components/NpcSheetModal";
import { PlayerCardLarge } from "./components/PlayerCardLarge";
import { QuestProgressBar } from "./components/QuestProgressBar";
import { StoryTree } from "./components/StoryTree";
import { DND_RULEBOOKS } from "./index";

// The running-session screen, laid out like every other game via GameScreen.
// Left sidebar: the game menu. Right sidebar: the chronicle. Bottom tray:
// the sages' chat — the DM types what the players said/did and the model
// grows the story tree (per party) at the current waypoint/node.

const SERIF = { fontFamily: "ui-serif, Georgia, serif" } as const;

type MenuScreen = "main" | "players" | "npcs" | "history" | "sources";

const MENU: { id: MenuScreen; label: string; description: string }[] = [
  { id: "main", label: "Game Screen", description: "The story tree" },
  { id: "players", label: "Players", description: "The party ledger" },
  { id: "npcs", label: "NPCs & Monsters", description: "Cast & bestiary" },
  { id: "history", label: "History", description: "The chronicle" },
  { id: "sources", label: "Sources", description: "Tomes & sheets" },
];

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type Props = {
  campaign: Campaign;
  party: DndParty;
};

export function DndGameScreen({ campaign, party }: Props) {
  const queryClient = useQueryClient();
  const [screen, setScreen] = useState<MenuScreen>("main");
  const [waypointIndex, setWaypointIndex] = useState(0);
  const [path, setPath] = useState<string[]>([]); // node ids, root → current
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"root" | "node">("root");
  const [viewingCharacterId, setViewingCharacterId] = useState<string | null>(null);
  const [viewingNpc, setViewingNpc] = useState<DndNpc | null>(null);
  const [recharting, setRecharting] = useState(false);
  const [combatOrder, setCombatOrder] = useState<InitiativeOrder | null>(null);
  const [turnResult, setTurnResult] = useState<ResolveTurnResponse | null>(null);

  // (Re-)register the live session so a beamer companion can attach.
  useEffect(() => {
    createDndSession(campaign.id).catch(() => {});
  }, [campaign.id]);

  const charactersQuery = useQuery({
    queryKey: qk.dndCharacters(party.id),
    queryFn: charactersQueryFn(party.id),
  });
  const nodesQuery = useQuery({
    queryKey: qk.dndNodes(party.id),
    queryFn: nodesQueryFn(party.id),
  });
  const npcsQuery = useQuery({
    queryKey: qk.dndNpcs(campaign.id),
    queryFn: npcsQueryFn(campaign.id),
    // While a recharter job runs server-side, poll until the cast changes.
    refetchInterval: recharting ? 5000 : false,
  });
  const filesQuery = useQuery({ queryKey: qk.dndFiles(), queryFn: filesQueryFn });
  const historyQuery = useQuery({
    queryKey: qk.dndHistory(party.id),
    queryFn: historyQueryFn(party.id),
  });
  const combatQuery = useQuery({
    queryKey: qk.dndCombat(party.id),
    queryFn: activeCombatQueryFn(party.id),
  });

  const characters = charactersQuery.data?.characters ?? [];
  const partyMembers = characters.filter((ch) => ch.status === "ready" && ch.sheet);
  const nodes = nodesQuery.data?.nodes ?? [];
  const npcs = npcsQuery.data?.npcs ?? [];
  const files = filesQuery.data?.files ?? [];
  const history = historyQuery.data?.entries ?? [];

  const currentNodeId = path.at(-1) ?? null;
  const currentNode = nodes.find((n) => n.id === currentNodeId) ?? null;
  const branchingBlocked = currentNode?.nodeType === "initiative";
  const activeCombat = combatQuery.data?.combat ?? null;
  // The combat phase takes over the main screen only while standing on the
  // initiative node the fight was started from.
  const combatHere =
    activeCombat !== null &&
    activeCombat.status === "active" &&
    currentNode !== null &&
    activeCombat.nodeId === currentNode.id
      ? activeCombat
      : null;
  const viewingCharacter =
    characters.find((ch) => ch.id === viewingCharacterId && ch.sheet) ?? null;

  const generateMutation = useMutation({
    mutationFn: (msg: string) =>
      generateNode(party.id, {
        waypointIndex,
        parentId: mode === "node" && currentNodeId && !branchingBlocked ? currentNodeId : null,
        message: msg,
      }),
    onSuccess: (result) => {
      setMessage("");
      // Step straight into the fresh node — the players are waiting for the
      // narration. (Existing branches still reveal only on click.)
      setPath(
        result.node.parentId === null ? [result.node.id] : [...path.slice(0), result.node.id],
      );
      void queryClient.invalidateQueries({ queryKey: qk.dndNodes(party.id) });
    },
    // Even a proxy timeout leaves the node persisted — re-fetch regardless.
    onError: () => void queryClient.invalidateQueries({ queryKey: qk.dndNodes(party.id) }),
  });

  const retriggerMutation = useMutation({
    mutationFn: () => retriggerNpcs(campaign.id),
    onSuccess: () => setRecharting(true),
  });

  // The table history: appended when the DM presses Log — the ground truth
  // of what the party has actually heard.
  const logMutation = useMutation({
    mutationFn: (entries: Parameters<typeof appendHistoryEntries>[1]) =>
      appendHistoryEntries(party.id, entries),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.dndHistory(party.id) }),
  });

  const waypoint = campaign.checkpoints[waypointIndex];
  const arrivalHeader = waypoint ? `The party reaches ${waypoint.title}.` : "";
  const currentLogged =
    currentNode !== null &&
    history.some((h) => h.nodeId === currentNode.id && h.kind === "dm-narration");
  const arrivalLogged = history.some((h) => h.kind === "arrival" && h.text === arrivalHeader);
  const combatLogged =
    currentNode !== null && history.some((h) => h.nodeId === currentNode.id && h.kind === "combat");

  const startCombatMutation = useMutation({
    mutationFn: (order: InitiativeOrder) =>
      startCombat(party.id, {
        nodeId: currentNode?.id ?? "",
        combatants: order.combatants,
      }),
    onSuccess: (result, order) => {
      queryClient.setQueryData(qk.dndCombat(party.id), { combat: result.combat });
      setTurnResult(null);
      if (!combatLogged && currentNode) {
        logMutation.mutate([{ kind: "combat", text: order.summary, nodeId: currentNode.id }]);
      }
    },
  });

  const resolveTurnMutation = useMutation({
    mutationFn: (args: { combatId: string; message: string }) =>
      resolveTurn(args.combatId, args.message),
    onSuccess: (result) => {
      setTurnResult(result);
      queryClient.setQueryData(qk.dndCombat(party.id), { combat: result.combat });
      // Legal turn: the report is consumed. Alerts: leave it in the chat to amend.
      if (result.alerts.length === 0) setMessage("");
    },
  });

  const advanceMutation = useMutation({
    mutationFn: (combatId: string) => advanceCombat(combatId),
    onSuccess: (result) => {
      queryClient.setQueryData(qk.dndCombat(party.id), { combat: result.combat });
      setTurnResult(null);
    },
  });

  const endCombatMutation = useMutation({
    mutationFn: (combatId: string) => endCombat(combatId),
    onSuccess: () => {
      queryClient.setQueryData(qk.dndCombat(party.id), { combat: null });
      setTurnResult(null);
      setMessage("");
    },
  });

  const logTurnAndAdvance = () => {
    if (!combatHere || !turnResult || turnResult.alerts.length > 0) return;
    logMutation.mutate([{ kind: "combat", text: turnResult.narration, nodeId: combatHere.nodeId }]);
    advanceMutation.mutate(combatHere.id);
  };

  const logCurrentNode = () => {
    if (!currentNode || currentLogged) return;
    logMutation.mutate([
      { kind: "player-action", text: currentNode.trigger, nodeId: currentNode.id },
      { kind: "dm-narration", text: currentNode.readText, nodeId: currentNode.id },
    ]);
  };

  const logArrival = () => {
    if (!waypoint?.arrivalText || arrivalLogged) return;
    logMutation.mutate([
      { kind: "arrival", text: arrivalHeader, nodeId: null },
      { kind: "dm-narration", text: waypoint.arrivalText, nodeId: null },
    ]);
  };

  const selectWaypoint = (i: number) => {
    setWaypointIndex(i);
    setPath([]);
    setMode("root");
    setCombatOrder(null);
  };

  const send = () => {
    const msg = message.trim();
    if (!msg) return;
    if (combatHere) {
      if (!resolveTurnMutation.isPending)
        resolveTurnMutation.mutate({ combatId: combatHere.id, message: msg });
      return;
    }
    if (!generateMutation.isPending) generateMutation.mutate(msg);
  };

  // Ultra-short recap of the LOGGED history only — what the party last did
  // and how the DM answered, glanceable across sessions.
  const recap = history.slice(-9).map((h) => ({
    id: h.id,
    kind: h.kind,
    line:
      (h.kind === "player-action" ? "▸ " : h.kind === "combat" ? "⚔ " : "") +
      (h.text.length > 72 ? `${h.text.slice(0, 71)}…` : h.text),
  }));

  return (
    <GameScreen
      background="bg-gradient-to-b from-[#1a0606] via-surface-950 to-black"
      leftSidebarTitle={campaign.title ?? "Campaign"}
      leftSidebar={
        <div className="flex h-full flex-col gap-4">
          <nav className="flex flex-col gap-1.5">
            {MENU.map((item) => {
              const selected = item.id === screen;
              return (
                <Button
                  key={item.id}
                  variant={selected ? "tinted" : "ghost"}
                  tone="amber"
                  align="start"
                  block
                  onClick={() => setScreen(item.id)}
                  className={selected ? "" : "text-amber-200/60 hover:text-amber-100"}
                >
                  <span className="flex min-w-0 flex-col items-start">
                    <span className="font-fantasy text-sm font-bold">{item.label}</span>
                    <span className="text-3xs font-normal opacity-70" style={SERIF}>
                      {item.description}
                    </span>
                  </span>
                </Button>
              );
            })}
          </nav>
          <p className="mt-auto text-3xs leading-relaxed text-amber-200/40" style={SERIF}>
            {party.name} · waypoint {waypointIndex + 1} of {campaign.checkpoints.length}
          </p>
        </div>
      }
      sidebar={
        recap.length === 0 ? (
          <p className="text-xs leading-relaxed text-amber-200/40" style={SERIF}>
            Nothing logged yet — press Log on a spoken text and the chronicle starts here.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {recap.map((entry) => (
              <li
                key={entry.id}
                className={`rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed ${
                  entry.kind === "player-action"
                    ? "border-amber-400/15 bg-black/10 italic text-amber-300/70"
                    : entry.kind === "combat"
                      ? "border-rose-400/20 bg-rose-950/20 text-rose-100/80"
                      : "border-amber-400/10 bg-black/20 text-amber-200/70"
                }`}
              >
                {entry.line}
              </li>
            ))}
          </ol>
        )
      }
      fanActions={
        screen === "main" && combatHere ? (
          // Combat controls: log the referee's narration and pass the torch,
          // or skip ahead, or call the fight.
          <div className="flex items-center gap-2">
            {turnResult !== null && turnResult.alerts.length === 0 && (
              <Button
                variant="tinted"
                tone="amber"
                size="sm"
                loading={logMutation.isPending || advanceMutation.isPending}
                onClick={logTurnAndAdvance}
              >
                Log &amp; next
              </Button>
            )}
            <Button
              variant="ghost"
              tone="amber"
              size="sm"
              loading={advanceMutation.isPending}
              onClick={() => advanceMutation.mutate(combatHere.id)}
            >
              Next combatant
            </Button>
            <span className="text-3xs uppercase tracking-[0.2em] text-rose-300/60" style={SERIF}>
              Round {combatHere.round}
            </span>
            <Button
              variant="tinted"
              tone="rose"
              size="sm"
              className="ml-auto"
              loading={endCombatMutation.isPending}
              onClick={() => endCombatMutation.mutate(combatHere.id)}
            >
              End combat
            </Button>
          </div>
        ) : screen === "main" && branchingBlocked ? (
          // On an initiative node the action bar carries the one action that
          // matters: rolling into the combat phase (which also logs the
          // participants and turn order to the history).
          <Button
            variant="tinted"
            tone="rose"
            size="sm"
            disabled={combatOrder === null || activeCombat !== null}
            loading={startCombatMutation.isPending}
            onClick={() => combatOrder && startCombatMutation.mutate(combatOrder)}
          >
            {activeCombat !== null ? "Combat underway ⚔" : "Enter combat"}
          </Button>
        ) : screen === "main" ? (
          <div className="flex items-center gap-2">
            <Button
              variant={mode === "root" ? "tinted" : "ghost"}
              tone="amber"
              size="xs"
              onClick={() => setMode("root")}
            >
              New root
            </Button>
            <Button
              variant={mode === "node" ? "tinted" : "ghost"}
              tone="amber"
              size="xs"
              disabled={currentNodeId === null}
              onClick={() => setMode("node")}
            >
              New branch
            </Button>
          </div>
        ) : undefined
      }
      fan={
        screen === "main" && (!branchingBlocked || combatHere) ? (
          <div className="flex gap-2" style={{ height: 190 }}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={
                combatHere
                  ? 'What happened this turn? — e.g. "Victor darts behind the vine and stabs: 19 to hit, 8 piercing."'
                  : 'What do the players say or do? — e.g. "We pry open the crypt door as quietly as we can."'
              }
              className="h-full min-w-0 flex-1 resize-none rounded-2xl border border-amber-400/25 bg-[#1a0606]/70 p-3 text-sm text-amber-100 placeholder:text-amber-200/30 focus:border-amber-300/60 focus:outline-none"
            />
            <div className="flex w-36 shrink-0 flex-col justify-between gap-2">
              <p className="text-3xs leading-relaxed text-amber-200/40" style={SERIF}>
                {combatHere
                  ? "The referee checks the rules, updates everyone, and reads the turn back."
                  : `The sages will chart the ${mode === "root" ? "new beginning" : "next step"} and read it back.`}
              </p>
              {(combatHere ? resolveTurnMutation : generateMutation).isError && (
                <p className="text-3xs text-rose-300">
                  {errorMessageOf(
                    (combatHere ? resolveTurnMutation : generateMutation).error,
                    combatHere ? "The referee faltered." : "The sages faltered.",
                  )}
                </p>
              )}
              <Button
                variant="tinted"
                tone={combatHere ? "rose" : "amber"}
                block
                disabled={!message.trim()}
                loading={combatHere ? resolveTurnMutation.isPending : generateMutation.isPending}
                onClick={send}
              >
                {combatHere ? "Send to the referee" : "Send to the sages"}
              </Button>
            </div>
          </div>
        ) : (
          // Reserved tray on other screens — kept at the unified fan height.
          <div style={{ height: 190 }} aria-hidden="true" />
        )
      }
    >
      {screen === "main" && (
        <>
          <div className="shrink-0 rounded-2xl border border-amber-400/20 bg-gradient-to-br from-[#2a0808]/70 via-surface-900/80 to-black/70 px-4 py-3">
            <QuestProgressBar
              checkpoints={campaign.checkpoints}
              selected={waypointIndex}
              onSelect={selectWaypoint}
              showDetail={false}
            />
          </div>
          {nodesQuery.isPending ? (
            <LoadingState fill label="Unrolling the story tree…" />
          ) : combatHere ? (
            <CombatPanel
              combat={combatHere}
              party={partyMembers}
              npcs={npcs}
              turnResult={turnResult}
            />
          ) : (
            <StoryTree
              campaign={campaign}
              nodes={nodes}
              waypointIndex={waypointIndex}
              path={path}
              onEnterNode={(nodeId) => setPath([...path, nodeId])}
              onJumpTo={(i) => setPath(i < 0 ? [] : path.slice(0, i + 1))}
              party={partyMembers}
              npcs={npcs}
              onOrderChange={setCombatOrder}
              onLogCurrent={logCurrentNode}
              currentLogged={currentLogged}
              onLogArrival={logArrival}
              arrivalLogged={arrivalLogged}
              logPending={logMutation.isPending}
            />
          )}
        </>
      )}

      {screen === "players" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {charactersQuery.isPending ? (
            <LoadingState fill label="Opening the party ledger…" />
          ) : partyMembers.length === 0 ? (
            <EmptyState
              tone="amber"
              fill
              icon={<D20Die count={20} className="h-6 w-6" />}
              title="No adventurers in the party"
              description="Recruit them from the party setup before the session."
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {partyMembers.map((character) => (
                <li key={character.id} className="min-h-0">
                  <PlayerCardLarge
                    character={character}
                    onView={() => setViewingCharacterId(character.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {screen === "npcs" && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex shrink-0 items-center justify-between gap-3 px-1">
            <p className="text-2xs text-amber-200/50" style={SERIF}>
              {recharting
                ? "The sages are recharting the cast from the module — this takes a few minutes."
                : "Charted from the module's appendix."}
            </p>
            <Button
              variant="tinted"
              tone="amber"
              size="xs"
              loading={retriggerMutation.isPending}
              disabled={recharting}
              onClick={() => retriggerMutation.mutate()}
            >
              Recharter NPCs
            </Button>
          </div>
          {retriggerMutation.isError && (
            <p className="px-1 text-xs text-rose-300">
              {errorMessageOf(retriggerMutation.error, "Recharter failed.")}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {npcsQuery.isPending ? (
              <LoadingState fill label="Consulting the dramatis personae…" />
            ) : npcs.length === 0 ? (
              <EmptyState
                tone="amber"
                fill
                icon={<D20Die count={20} className="h-6 w-6" />}
                title="No NPC cards"
                description='NPCs are charted from the module when a campaign is uploaded. Use "Recharter NPCs" above — or re-upload the module if it predates source storage.'
              />
            ) : (
              <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 2xl:grid-cols-3">
                {npcs.map((npc) => (
                  <li key={npc.id}>
                    {/* biome-ignore lint/correctness/noRestrictedElements: full-card click target styled as an NPC card; Button/Chip chrome doesn't fit. */}
                    <button
                      type="button"
                      onClick={() => setViewingNpc(npc)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-amber-400/20 bg-gradient-to-br from-[#2a0808]/80 via-surface-900/90 to-black/80 p-3 text-left transition-colors hover:border-amber-400/40"
                    >
                      <span
                        aria-hidden="true"
                        className={`font-fantasy grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-bold ring-1 ${
                          npc.category === "monster"
                            ? "bg-emerald-500/20 text-emerald-200 ring-emerald-400/50"
                            : "bg-purple-500/20 text-purple-200 ring-purple-400/50"
                        }`}
                      >
                        {npc.name[0]?.toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-fantasy block truncate text-base font-bold text-amber-100">
                          {npc.name}
                        </span>
                        <span className="block truncate text-2xs text-amber-200/60">
                          {npc.role}
                        </span>
                      </span>
                      {npc.category === "monster" && (
                        <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-[0.12em] text-emerald-200/80 ring-1 ring-emerald-400/30">
                          Monster
                        </span>
                      )}
                      <span className="flex shrink-0 gap-1">
                        {npc.maxHp !== null && (
                          <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-3xs font-bold text-rose-200 ring-1 ring-rose-400/30">
                            {npc.maxHp} HP
                          </span>
                        )}
                        {npc.armorClass !== null && (
                          <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-3xs font-bold text-sky-200 ring-1 ring-sky-400/30">
                            AC {npc.armorClass}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {screen === "history" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {historyQuery.isPending ? (
            <LoadingState fill label="Opening the chronicle…" />
          ) : (
            <HistoryLog
              entries={history}
              party={partyMembers}
              npcs={npcs}
              onOpenCharacter={(character) => setViewingCharacterId(character.id)}
              onOpenNpc={(npc) => setViewingNpc(npc)}
            />
          )}
        </div>
      )}

      {screen === "sources" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4">
            <div>
              <p
                className="px-1 text-3xs font-bold uppercase tracking-[0.25em] text-amber-300/50"
                style={SERIF}
              >
                Rulebooks
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {DND_RULEBOOKS.map((book) => (
                  <li key={book.url}>
                    <a
                      href={book.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-2xl border border-amber-400/20 bg-gradient-to-br from-[#2a0808]/80 via-surface-900/90 to-black/80 p-3 transition-colors hover:border-amber-400/40"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/40">
                        <BookIcon className="h-4 w-4" />
                      </span>
                      <span className="font-fantasy min-w-0 flex-1 truncate text-base font-bold text-amber-100">
                        {book.label}
                      </span>
                      <span className="shrink-0 rounded-full bg-white/[0.04] px-2 py-0.5 text-3xs font-semibold uppercase tracking-[0.12em] text-fg-secondary ring-1 ring-white/10">
                        Core rules
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p
                className="px-1 text-3xs font-bold uppercase tracking-[0.25em] text-amber-300/50"
                style={SERIF}
              >
                Uploaded tomes & sheets
              </p>
              {filesQuery.isPending ? (
                <LoadingState label="Opening the archive…" />
              ) : files.length === 0 ? (
                <p className="mt-2 px-1 text-xs text-amber-200/50" style={SERIF}>
                  Nothing archived yet — PDFs uploaded from now on land here.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {files.map((file) => (
                    <li key={file.id}>
                      <a
                        href={fileContentUrl(file.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 rounded-2xl border border-amber-400/20 bg-gradient-to-br from-[#2a0808]/80 via-surface-900/90 to-black/80 p-3 transition-colors hover:border-amber-400/40"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/40">
                          <BookIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-fantasy block truncate text-base font-bold text-amber-100">
                            {file.filename}
                          </span>
                          <span className="block text-3xs text-amber-200/40">
                            {formatSize(file.sizeBytes)}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-3xs font-semibold uppercase tracking-[0.12em] ring-1 ${
                            file.kind === "module"
                              ? "bg-amber-400/10 text-amber-200/80 ring-amber-400/25"
                              : "bg-sky-500/10 text-sky-200/80 ring-sky-400/25"
                          }`}
                        >
                          {file.kind === "module" ? "Module" : "Character sheet"}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {viewingCharacter && (
        <CharacterSheetModal
          character={viewingCharacter}
          onClose={() => setViewingCharacterId(null)}
        />
      )}
      {viewingNpc && <NpcSheetModal npc={viewingNpc} onClose={() => setViewingNpc(null)} />}
    </GameScreen>
  );
}
