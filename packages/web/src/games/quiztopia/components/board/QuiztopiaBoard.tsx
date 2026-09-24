import type {
  HelpCardId,
  QuiztopiaAction,
  QuiztopiaPlayerView,
} from "@boardgames/core/games/quiztopia/types";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionLog } from "../../../../components/action-log";
import GameScreen from "../../../../components/game-layout/GameScreen";
import { PromptRow } from "../../../../components/game-layout/PromptRow";
import { Button, Kbd } from "../../../../components/ui";
import { districtByIndex } from "../../bands";
import { isPlainKey, isTypingTarget } from "../../keys";
import { type BoardLanguage, cycleLanguage } from "../../logic/copy";
import { findLegal, hasLegal, legalOfKind } from "../../logic/legal";
import { type SeatNames, seatLabel, seatName } from "../../logic/seats";
import BakeryPanel from "./BakeryPanel";
import CityRow from "./CityRow";
import ExpertPanels from "./ExpertPanels";
import HelpCardDialog from "./HelpCardDialog";
import HelpFan from "./HelpFan";
import JudgePanel from "./JudgePanel";
import LossPendingPanel from "./LossPendingPanel";
import { mapQuiztopiaLog, verdictLine } from "./log-mapper";
import ObjectiveRail, { ObjectiveStrip } from "./ObjectiveRail";
import QuestionPanel from "./QuestionPanel";
import ReaderStrip from "./ReaderStrip";
import Shelves from "./Shelves";
import TipCardRow from "./TipCardRow";

// The co-op board. Everything the viewer may do comes from `legalActions`
// (the server's own enumeration for this seat) — a control renders only
// when `hasLegal` finds its action, and what gets sent is that same object.
// Turn ownership is read off the view (`you === activeSeat`), never off the
// room's `isMyTurn`, because the machine reports no active player while the
// table can still play help cards, flip tips or press penalties.

type Props = {
  view: QuiztopiaPlayerView;
  legalActions: readonly QuiztopiaAction[];
  seatNames: SeatNames;
  send: (action: QuiztopiaAction) => void;
};

const FLASH_MS = 600;

/** Which building names to show for a board language. */
function nameLang(lang: BoardLanguage): "en" | "de" {
  return lang === "de" ? "de" : "en";
}

export default function QuiztopiaBoard({ view, legalActions, seatNames, send }: Props) {
  const reduced = useReducedMotion();
  const you = view.you;
  const isActive = you === view.activeSeat;
  const isReader = view.readerSeat !== null && you === view.readerSeat;
  const activeName = seatLabel(seatNames, view.activeSeat, you);
  const activePlain = seatName(seatNames, view.activeSeat);
  const q = view.turn.question;

  // Board language: the room default seeds it; L cycles EN → DE → Both.
  const [lang, setLang] = useState<BoardLanguage>(view.language ?? "both");
  const bl = nameLang(lang);

  // ── What this seat may do right now ─────────────────────────────────────
  const legal = useMemo(() => {
    const choose = legalOfKind(legalActions, "choose-building");
    const help = legalOfKind(legalActions, "play-help");
    return {
      choosable: new Set(choose.map((a) => a.buildingIndex)),
      canChoose: choose.length > 0,
      canReveal: hasLegal(legalActions, { kind: "reveal" }),
      canJudge: hasLegal(legalActions, { kind: "judge" }),
      canFlip: hasLegal(legalActions, { kind: "flip-tip-card" }),
      canReactivate: hasLegal(legalActions, { kind: "reactivate-tip" }),
      canPenalty: hasLegal(legalActions, { kind: "penalty" }),
      canBakery: hasLegal(legalActions, { kind: "bakery" }),
      canAcceptLoss: hasLegal(legalActions, { kind: "accept-loss" }),
      playableHelp: new Set<HelpCardId>(help.map((a) => a.helpId)),
      besetzungTargets: help
        .filter((a) => a.helpId === "besetzung")
        .map((a) => a.buildingIndex)
        .filter((i): i is number => i !== undefined),
    };
  }, [legalActions]);

  const sendLegal = useCallback(
    (query: Parameters<typeof findLegal>[1]) => {
      const action = findLegal(legalActions, query);
      if (action) send(action);
    },
    [legalActions, send],
  );

  // ── Help card dialog ────────────────────────────────────────────────────
  const [helpDialog, setHelpDialog] = useState<HelpCardId | null>(null);
  const [picking, setPicking] = useState(false);
  const closeHelp = useCallback(() => {
    setHelpDialog(null);
    setPicking(false);
  }, []);
  const dialogCard = helpDialog ? view.help.faceUp.find((c) => c.id === helpDialog) : undefined;

  // The card got played (by us or anyone) or the phase moved on: drop the dialog.
  useEffect(() => {
    if (helpDialog && (!dialogCard || dialogCard.used)) closeHelp();
  }, [helpDialog, dialogCard, closeHelp]);
  useEffect(() => {
    if (view.phase === "game-over") closeHelp();
  }, [view.phase, closeHelp]);

  const playHelp = useCallback(
    (helpId: HelpCardId, buildingIndex?: number) => {
      sendLegal(
        buildingIndex === undefined
          ? { kind: "play-help", helpId }
          : { kind: "play-help", helpId, buildingIndex },
      );
      closeHelp();
    },
    [sendLegal, closeHelp],
  );

  const openBesetzung = useCallback(() => {
    setHelpDialog("besetzung");
    setPicking(true);
  }, []);

  // ── Verdict flash ───────────────────────────────────────────────────────
  const [flash, setFlash] = useState<"success" | "danger" | null>(null);
  const flashSeen = useRef<number | null>(view.lastResolution?.turn ?? null);
  useEffect(() => {
    const r = view.lastResolution;
    if (!r || r.turn === flashSeen.current) return;
    flashSeen.current = r.turn;
    setFlash(r.correct ? "success" : "danger");
    const id = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(id);
  }, [view.lastResolution]);

  // ── Live region ─────────────────────────────────────────────────────────
  // Public facts only: whose turn, which building, the public reveal, the
  // verdict, the offers. A reader's or a peeker's private answer never
  // passes through here.
  const [announce, setAnnounce] = useState("");
  const seen = useRef<{
    turn: number;
    building: number | null;
    revealed: boolean;
    resolution: number | null;
    phase: QuiztopiaPlayerView["phase"];
    plenum: boolean;
  } | null>(null);
  useEffect(() => {
    const t = view.turn;
    const p = seen.current;
    const msgs: string[] = [];
    const building = t.buildingIndex === null ? null : districtByIndex(t.buildingIndex);
    const buildingName = building
      ? bl === "de"
        ? building.buildingLabelDe
        : building.buildingLabel
      : "";
    if (!p || p.turn !== t.index) {
      msgs.push(
        `Turn ${t.index}. ${activePlain} answers${view.readerSeat !== null ? `, ${seatName(seatNames, view.readerSeat)} reads` : ""}.`,
      );
    }
    if (p && t.buildingIndex !== null && (p.building !== t.buildingIndex || p.turn !== t.index)) {
      msgs.push(`${activePlain} picked ${buildingName}.`);
    }
    if (p && t.revealed && (!p.revealed || p.turn !== t.index) && q?.answerEn != null) {
      msgs.push(`Answer revealed: ${bl === "de" ? q.answerDe : q.answerEn}.`);
    }
    const r = view.lastResolution;
    if (p && r && r.turn !== p.resolution) {
      const d = districtByIndex(r.buildingIndex);
      msgs.push(
        `${verdictLine({ correct: r.correct, shielded: r.shielded, buildingAfter: r.after, categoryIndex: d.index }, bl).text}.`,
      );
    }
    if (p && view.bakeryOffer && p.phase !== "bakery-offer") {
      msgs.push("Quiztopia is saved. Take the win or go for all 12.");
    }
    if (p && view.lossPending && p.phase !== "loss-pending") {
      msgs.push("Too many buildings lost. Play Besetzung or accept the loss.");
    }
    if (p && t.plenum && !p.plenum) msgs.push("Plenum: open discussion.");
    seen.current = {
      turn: t.index,
      building: t.buildingIndex,
      revealed: t.revealed,
      resolution: r?.turn ?? null,
      phase: view.phase,
      plenum: t.plenum,
    };
    if (msgs.length > 0) setAnnounce(msgs.join(" "));
  }, [view, q, bl, activePlain, seatNames]);

  // ── Keyboard ────────────────────────────────────────────────────────────
  const keyHandler = (e: KeyboardEvent) => {
    if (!isPlainKey(e) || isTypingTarget(e.target)) return;
    const key = e.key.toLowerCase();
    if (key === "escape" && helpDialog) {
      e.preventDefault();
      closeHelp();
      return;
    }
    if (key === "l") {
      e.preventDefault();
      setLang((l) => cycleLanguage(l));
      return;
    }
    if (key === "r" && legal.canReveal) {
      e.preventDefault();
      sendLegal({ kind: "reveal" });
      return;
    }
    if ((key === "y" || key === "1") && legal.canJudge) {
      e.preventDefault();
      sendLegal({ kind: "judge", correct: true });
      return;
    }
    if ((key === "n" || key === "2") && legal.canJudge) {
      e.preventDefault();
      sendLegal({ kind: "judge", correct: false });
      return;
    }
    if (key === "t" && legal.canFlip) {
      e.preventDefault();
      sendLegal({ kind: "flip-tip-card" });
      return;
    }
    if (key === "h" && !helpDialog) {
      const first = view.help.faceUp.find((c) => !c.used);
      if (first) {
        e.preventDefault();
        setHelpDialog(first.id);
      }
      return;
    }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && legal.canChoose) {
      // Hand the arrows to the city row: focus its roving card, which then
      // owns ←/→ and Enter itself.
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("[data-city-row]")) return;
      const card = document.querySelector<HTMLElement>('[data-city-row] button[tabindex="0"]');
      if (card) {
        e.preventDefault();
        card.focus();
      }
    }
  };
  const keyRef = useRef(keyHandler);
  keyRef.current = keyHandler;
  useEffect(() => {
    const on = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // ── Derived display ─────────────────────────────────────────────────────
  const privateAnswer =
    q !== null &&
    q.answerEn !== null &&
    q.answerDe !== null &&
    !view.turn.revealed &&
    (isReader || view.turn.peekSeat === you);
  const barredNames = view.turn.plenumBarred.map((s) => seatLabel(seatNames, s, you));
  const noTips =
    view.expert &&
    view.tipCards !== null &&
    view.tipCards.active === 0 &&
    view.phase === "question";
  const showHelpDialog = helpDialog !== null && dialogCard !== undefined;

  const prompt = (() => {
    switch (view.phase) {
      case "choose-building":
        return isActive ? (
          <PromptRow title="Your turn" message="pick a building">
            <span className="hidden items-center gap-1 text-2xs text-fg-muted sm:inline-flex">
              <Kbd>←</Kbd>
              <Kbd>→</Kbd>
              <Kbd>Enter</Kbd>
            </span>
          </PromptRow>
        ) : (
          <PromptRow
            tone="waiting"
            pulse
            message={`Waiting for ${activeName} to pick a building`}
          />
        );
      case "question":
        if (isActive) {
          return (
            <PromptRow
              title="Your turn"
              message={view.expert ? "answer alone, then reveal" : "discuss, then reveal"}
            >
              {legal.canReveal && (
                <Button variant="primary" size="sm" onClick={() => sendLegal({ kind: "reveal" })}>
                  Reveal answer <Kbd>R</Kbd>
                </Button>
              )}
            </PromptRow>
          );
        }
        if (view.turn.plenum) {
          return (
            <PromptRow
              tone="waiting"
              pulse
              title="Plenum"
              message={`open discussion, ${activeName} decides`}
            />
          );
        }
        if (view.expert) {
          return (
            <PromptRow
              tone="waiting"
              pulse
              message={
                legal.canFlip
                  ? `${activeName} answers alone · flip a tip card to help`
                  : `${activeName} answers alone`
              }
            />
          );
        }
        return (
          <PromptRow
            tone="waiting"
            pulse
            message={
              isReader
                ? `${activeName} answers · you hold the card`
                : `${activeName} answers · discuss`
            }
          />
        );
      case "judge":
        return isActive ? (
          <PromptRow title="Your turn" message="was that right?" />
        ) : (
          <PromptRow tone="waiting" pulse message={`${activeName} is judging`} />
        );
      case "bakery-offer":
        return isActive ? (
          <PromptRow title="Your call" message="take the win or go for the whole bakery" />
        ) : (
          <PromptRow
            tone="waiting"
            pulse
            message={`${activeName} decides · take the win or go for all 12`}
          />
        );
      case "loss-pending":
        return <PromptRow tone="waiting" pulse message="play Besetzung or accept the loss" />;
      case "game-over":
        return <PromptRow message="Game over" />;
    }
  })();

  return (
    <GameScreen
      background="bg-surface-950"
      contentClassName="mx-auto w-full max-w-5xl"
      leftSidebarTitle="Objective"
      leftSidebar={<ObjectiveRail view={view} seatNames={seatNames} />}
      sidebar={<ActionLog blocks={mapQuiztopiaLog(view, seatNames, bl)} />}
      fan={
        <HelpFan
          faceUp={view.help.faceUp}
          hidden={view.help.hidden}
          deckSize={view.help.deckSize}
          playerCount={view.playerCount}
          playableIds={legal.playableHelp}
          lang={lang}
          onOpen={(id) => {
            setPicking(false);
            setHelpDialog(id);
          }}
        />
      }
      fanActions={prompt}
    >
      {/* The board scrolls inside its column: a question panel plus a dialog
          can outgrow a laptop, and the fixed fan tray below must never move. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* One non-shrinking child: a panel with its own overflow-hidden (the
            question card) would otherwise be squeezed instead of scrolled. */}
        <div className="flex shrink-0 flex-col gap-3">
          <ObjectiveStrip view={view} className="lg:hidden" />

          <Shelves
            buildings={view.buildings}
            required={view.required}
            lossAt={view.lossAt}
            lang={bl}
            picking={showHelpDialog && helpDialog === "besetzung" && picking}
            returnable={new Set(legal.besetzungTargets)}
            onReturn={(i) => playHelp("besetzung", i)}
          />

          <CityRow
            buildings={view.buildings}
            activeIndex={view.turn.buildingIndex}
            canChoose={legal.canChoose}
            choosable={legal.choosable}
            onChoose={(i) => sendLegal({ kind: "choose-building", buildingIndex: i })}
            lang={bl}
          />

          {q && (
            <QuestionPanel
              turn={view.turn}
              cardsUsed={view.cardsUsed}
              revealed={view.turn.revealed}
              revealerLabel={activeName}
              lang={lang}
              onLangChange={setLang}
            />
          )}

          {privateAnswer && q?.answerEn != null && q.answerDe != null && (
            <ReaderStrip
              key={`private-${view.turn.index}-${q.cardRef}`}
              mode={isReader ? "reader" : "peek"}
              answerEn={q.answerEn}
              answerDe={q.answerDe}
              lang={lang}
              activeName={activeName}
              readerHint={view.turn.readerHint}
            />
          )}

          {view.expert && view.tipCards && view.phase !== "game-over" && (
            <TipCardRow
              tipCards={view.tipCards}
              tipFlips={view.turn.tipFlips}
              canFlip={legal.canFlip}
              onFlip={() => sendLegal({ kind: "flip-tip-card" })}
              canPenalty={legal.canPenalty}
              onPenalty={(severity) => sendLegal({ kind: "penalty", severity })}
            />
          )}

          {view.expert && (
            <ExpertPanels
              noTips={noTips}
              deckRemaining={view.deckRemaining}
              canReactivate={legal.canReactivate}
              onReactivate={() => sendLegal({ kind: "reactivate-tip" })}
              plenum={view.turn.plenum && view.phase === "question"}
              activeName={activeName}
              barredNames={barredNames}
            />
          )}

          {view.phase === "judge" && (
            <JudgePanel
              isActive={isActive}
              canJudge={legal.canJudge}
              activeName={activeName}
              onJudge={(correct) => sendLegal({ kind: "judge", correct })}
            />
          )}

          {view.bakeryOffer && (
            <BakeryPanel
              isActive={isActive}
              canDecide={legal.canBakery}
              deciderName={activeName}
              won={view.won}
              deckRemaining={view.deckRemaining}
              onDecide={(accept) => sendLegal({ kind: "bakery", accept })}
            />
          )}

          {view.lossPending && (
            <LossPendingPanel
              lost={view.lost}
              canBesetzung={legal.besetzungTargets.length > 0}
              canAccept={legal.canAcceptLoss}
              onBesetzung={openBesetzung}
              onAccept={() => sendLegal({ kind: "accept-loss" })}
            />
          )}

          {showHelpDialog && helpDialog && dialogCard && (
            <HelpCardDialog
              helpId={helpDialog}
              used={dialogCard.used}
              playable={legal.playableHelp.has(helpDialog)}
              lang={lang}
              besetzungTargets={legal.besetzungTargets}
              picking={picking}
              onStartPicking={() => setPicking(true)}
              onPlay={() => playHelp(helpDialog)}
              onReturn={(i) => playHelp("besetzung", i)}
              onClose={closeHelp}
            />
          )}
        </div>

        <AnimatePresence>
          {flash && (
            <motion.div
              key={flash}
              aria-hidden="true"
              initial={{ opacity: reduced ? 1 : 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.2 }}
              className={
                flash === "success"
                  ? "pointer-events-none fixed inset-0 z-lift bg-emerald-500/10"
                  : "pointer-events-none fixed inset-0 z-lift bg-rose-500/10"
              }
            />
          )}
        </AnimatePresence>

        <div aria-live="polite" className="sr-only">
          {announce}
        </div>
      </div>
    </GameScreen>
  );
}
