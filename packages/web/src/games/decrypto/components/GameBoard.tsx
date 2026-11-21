import type {
  DecryptoAction,
  DecryptoPlayerView,
  Digit,
  GuessPurpose,
  Team,
} from "@boardgames/core/games/decrypto/types";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GameScreen } from "../../../components/game-layout";
import { artUrl, artVars } from "../logic/art";
import {
  draftComplete,
  firstBlankRound,
  fmtCode,
  lastReveal,
  operatorName,
  teamName,
  teamNames,
} from "../logic/desk";
import { CodeScreen } from "./desk/CodeScreen";
import { Lamp, Nixie, TokenTray } from "./desk/Instruments";
import { History, Operators } from "./desk/Rails";
import {
  CodeCard,
  DialRow,
  InfoCard,
  type LampRow,
  LastCard,
  StatusLamps,
  Strip,
  TypingSheet,
} from "./desk/Slot";
import "./desk/desk.css";

// The Wireless Room: the board is the cipher desk. Token trays and the round
// nixie across the top, the two code screens with their tapes in the middle,
// and the transmission slot along the front, whose fixed box every phase
// fills — the typing sheet, the incoming strip and dials, the reveal. All
// phases run at activePlayer === -1, so every affordance keys off the view's
// `myPending` flags, never `isMyTurn`.

interface GameBoardProps {
  view: DecryptoPlayerView;
  playerNames: (string | null)[];
  images: (string | null)[];
  onAction: (action: DecryptoAction) => void;
  /** Last rule-rejection message from the server, if any. */
  error: string | null;
}

const ORDINALS = ["1st", "2nd", "3rd"];
/** Matches desk.css's `@container dc-desk (max-width: 560px)`. */
const NARROW_DESK_PX = 560;

/** Whether the desk is as narrow as desk.css's container query, measured the same way. */
function useNarrowDesk(): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const pad = Number.parseFloat(getComputedStyle(el).paddingLeft) || 0;
      setNarrow(el.clientWidth - 2 * pad <= NARROW_DESK_PX);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, narrow];
}

function useCountdown(deadlineTs: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadlineTs === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadlineTs]);
  return deadlineTs === null ? null : Math.max(0, Math.ceil((deadlineTs - now) / 1000));
}

export default function GameBoard({ view, playerNames, images, onAction, error }: GameBoardProps) {
  const formId = useId();
  const [deskRef, narrow] = useNarrowDesk();
  const [side, setSide] = useState<Team>(view.team);
  const [active, setActive] = useState(0);
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const secs = useCountdown(view.clueTimerDeadlineTs);
  const vars = useMemo(() => artVars() as CSSProperties, []);

  const tx = view.transmissions[view.txIdx] ?? null;
  const myTx =
    view.transmissions.find((t) => t.encryptor === view.seat && !t.resolved && !t.skipped) ?? null;
  const encrypting = view.phase === "clueWriting" && myTx !== null && myTx.code !== null;
  const guessing = view.phase === "guessing" && tx !== null;
  const revealing = view.phase === "reveal" && tx?.resolved != null;
  const purpose: GuessPurpose | null = view.myPending.decode
    ? "decode"
    : view.myPending.intercept
      ? "intercept"
      : null;
  const draft = guessing ? tx.myDraft : null;
  const editable = purpose !== null && draft !== null && guessing;
  const complete = draftComplete(draft);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new transmission or phase starts on the first dial
  useEffect(() => setActive(0), [view.txIdx, view.round, view.phase]);

  // A narrow desk shows one screen: follow the transmission being worked on.
  useEffect(() => {
    if (view.phase === "guessing" && tx) setSide(tx.team);
    else if (view.phase === "clueWriting") setSide(view.team);
  }, [view.phase, tx, view.team]);

  const pick = (slot: 0 | 1 | 2, digit: Digit) => {
    if (!purpose || !draft) return;
    const elsewhere = draft.findIndex((d, i) => d === digit && i !== slot);
    if (elsewhere >= 0)
      onAction({ kind: "set-draft", purpose, slot: elsewhere as 0 | 1 | 2, digit: null });
    onAction({ kind: "set-draft", purpose, slot, digit });
    setActive(Math.min(2, slot + 1));
  };
  const submitGuess = () => {
    if (purpose && draftComplete(draft)) {
      onAction({ kind: "submit-guess", purpose, code: [...draft] });
    }
  };

  // Keys 1–4 set the active dial, Backspace clears the last, Enter transmits.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pick/submitGuess read the same draft
  useEffect(() => {
    if (!editable || !draft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^[1-4]$/.test(e.key)) {
        e.preventDefault();
        const free = draft.indexOf(null);
        const slot = (draft[active] === null ? active : free >= 0 ? free : active) as 0 | 1 | 2;
        pick(slot, Number(e.key) as Digit);
      } else if (e.key === "Backspace") {
        const last = ([2, 1, 0] as const).find((i) => draft[i] !== null);
        if (last !== undefined && purpose) {
          onAction({ kind: "set-draft", purpose, slot: last, digit: null });
          setActive(last);
        }
      } else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, a - 1));
      else if (e.key === "ArrowRight") setActive((a) => Math.min(2, a + 1));
      else if (e.key === "Enter" && complete) submitGuess();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, draft?.join(","), active, complete, purpose]);

  // ── What lights up on the screens
  const lit: [boolean[], boolean[]] = [
    [false, false, false, false],
    [false, false, false, false],
  ];
  let badges: (string | null)[] | null = null;
  if (encrypting && myTx?.code) {
    badges = [null, null, null, null];
    myTx.code.forEach((d, i) => {
      if (badges) badges[d - 1] = ORDINALS[i] ?? null;
    });
    const focused = focusLine === null ? null : myTx.code[focusLine];
    if (focused) lit[view.team][focused - 1] = true;
  }
  if (guessing && tx) {
    const values = draft ?? (tx.team === view.team ? tx.code : null);
    for (const d of values ?? []) if (d) lit[tx.team][d - 1] = true;
  }
  if (revealing && tx?.resolved) for (const d of tx.resolved.code) lit[tx.team][d - 1] = true;

  const interceptorOnly = view.variant === "interceptor";
  const screen = (team: Team) => (
    <CodeScreen
      key={team}
      team={team}
      title={
        team === view.team
          ? `${teamName(view, team)} · your screen`
          : `${teamName(view, team)} · their screen`
      }
      words={team === view.team ? view.myKeywords : null}
      tapes={view.noteSheet[team]}
      lit={lit[team]}
      badges={team === view.team ? badges : null}
      fromRound={firstBlankRound(view)}
      maxRounds={view.maxRounds}
      hidden={narrow && !interceptorOnly && side !== team}
    />
  );
  const screenTeams: Team[] = interceptorOnly ? [0] : view.team === 0 ? [0, 1] : [1, 0];

  // ── The slot
  const roundTag = `Round ${Math.max(view.round, 1)}`;
  const last = lastReveal(view, revealing ? tx : null);
  let left: ReactNode;
  let mid: ReactNode;
  let right: ReactNode;

  if (view.phase === "clueWriting") {
    const rows: LampRow[] = view.transmissions.map((t) => ({
      label: `${teamName(view, t.team)} clues`,
      state: t.clues || t.skipped ? "done" : "work",
      text: t.clues
        ? t.encryptor === view.seat
          ? "Sent — the line is closed"
          : "Transmitted"
        : t.encryptor === view.seat
          ? "Waiting for your three lines"
          : `${operatorName(view, t.encryptor, playerNames)} is writing…`,
    }));
    left =
      encrypting && myTx ? (
        <CodeCard code={myTx.code} label={`Your code · ${roundTag}`} />
      ) : (
        <InfoCard
          eyebrow={roundTag}
          title="Clue writing"
          text={`${operatorName(view, view.transmissions[0]?.encryptor ?? 0, playerNames)} encrypts for ${teamName(view, view.transmissions[0]?.team ?? 0)}`}
        />
      );
    mid =
      encrypting && myTx ? (
        <TypingSheet
          formId={formId}
          view={view}
          tx={myTx}
          error={error}
          onSubmit={(clues) => onAction({ kind: "submit-clues", clues })}
          onFocusLine={setFocusLine}
        />
      ) : (
        <Strip
          clues={null}
          printKey="idle"
          placeholder="The line is quiet — the encryptors are writing"
        />
      );
    const otherTx = view.transmissions.find((t) => t.encryptor !== view.seat && !t.clues);
    right = (
      <>
        <StatusLamps rows={rows} />
        {secs !== null && (
          <div className="dc-timer">
            {artUrl("icon-timer") && <img src={artUrl("icon-timer")} alt="" />}
            <Nixie value={secs} label="Seconds" hot={secs <= 10} />
          </div>
        )}
        {encrypting && myTx && !myTx.clues ? (
          // biome-ignore lint/correctness/noRestrictedElements: the desk's painted transmit key, a game piece
          <button type="submit" form={formId} className="dc-key">
            Transmit clues <kbd>↵</kbd>
          </button>
        ) : (
          <div className="dc-keyplate">
            {encrypting && otherTx ? `Waiting for ${teamName(view, otherTx.team)}` : "Key locked"}
          </div>
        )}
      </>
    );
  } else if ((guessing || revealing) && tx) {
    const t = tx.team;
    const other: Team = t === 0 ? 1 : 0;
    const mine = t === view.team;
    left =
      revealing && tx.resolved ? (
        <CodeCard code={tx.resolved.code} label={`${teamName(view, t)} · ${roundTag}`} flip />
      ) : (
        <InfoCard
          eyebrow={`Incoming · ${view.txIdx + 1} of ${view.transmissions.length}`}
          icon={artUrl("icon-transmission")}
          title={
            <>
              <span className={`dc-tdot t${t}`} />
              {teamName(view, t)}'s code
            </>
          }
          text={`${operatorName(view, tx.encryptor, playerNames)} encrypted`}
        />
      );
    mid = (
      <>
        <Strip
          clues={tx.skipped ? null : tx.clues}
          printKey={`${view.round}-${view.txIdx}`}
          placeholder={
            tx.skipped ? "No clues came — the transmission is lost" : "Awaiting transmission…"
          }
        />
        <DialRow
          view={view}
          tx={tx}
          draft={draft}
          active={active}
          editable={editable}
          setActive={setActive}
          onPick={pick}
        />
      </>
    );
    let rows: LampRow[];
    if (revealing && tx.resolved) {
      const r = tx.resolved;
      rows = [
        {
          label: `${teamName(view, t)} decode`,
          state: r.miscommunicated ? "bad" : "done",
          text: r.miscommunicated
            ? `Misread as ${fmtCode(r.decodeGuess)} — a black token to ${teamName(view, t)}`
            : "Decoded cleanly",
        },
      ];
      if (tx.interceptRequired) {
        const hits = r.interceptGuess?.filter((d, i) => d === r.code[i]).length ?? 0;
        rows.push({
          label: `${teamName(view, other)} intercept`,
          state: r.intercepted ? "bad" : "done",
          text: r.intercepted
            ? `Intercepted — a white token to ${teamName(view, other)}`
            : `Held — they read ${fmtCode(r.interceptGuess)} (${hits}/3)`,
        });
      }
    } else {
      rows = [
        {
          label: `${teamName(view, t)} decode`,
          state: tx.decodeCommitted ? "done" : "work",
          text: tx.decodeCommitted
            ? "Locked in"
            : mine && view.myPending.decode
              ? "Your call — set the three dials"
              : `${teamNames(view, t, playerNames, tx.encryptor)} decoding…`,
        },
        tx.interceptRequired
          ? {
              label: `${teamName(view, other)} intercept`,
              state: tx.interceptCommitted ? "done" : "work",
              text: tx.interceptCommitted
                ? "Locked in"
                : !mine && view.myPending.intercept
                  ? "Your call — read their tapes"
                  : `${teamNames(view, other, playerNames)} intercepting…`,
            }
          : {
              label: `${teamName(view, other)} intercept`,
              state: "off",
              text: "No interceptions in round 1",
            },
      ];
    }
    let key: ReactNode;
    if (editable) {
      key = (
        // biome-ignore lint/correctness/noRestrictedElements: the desk's painted transmit key, a game piece
        <button type="button" className="dc-key" disabled={!complete} onClick={submitGuess}>
          Transmit answer <kbd>↵</kbd>
        </button>
      );
    } else if (revealing) {
      key = (
        <div className="dc-keyplate">
          {view.txIdx + 1 < view.transmissions.length
            ? `Next: ${teamName(view, other)}'s transmission`
            : "Round closes next"}
        </div>
      );
    } else if (
      purpose === null &&
      (tx.myDraft || (mine && tx.decodeCommitted) || (!mine && tx.interceptCommitted))
    ) {
      key = <div className="dc-keyplate">Locked in — waiting</div>;
    } else {
      key = (
        <div className="dc-keyplate">
          {tx.encryptor === view.seat ? "Your code — you listen" : "Key locked"}
        </div>
      );
    }
    right = (
      <>
        <StatusLamps rows={rows} />
        {key}
      </>
    );
  } else {
    const summary = view.roundSummaries.find((r) => r.round === view.round);
    left = <InfoCard eyebrow={roundTag} title="Line closed" text="Checking the trays…" />;
    mid = (
      <div className="dc-closing">
        {(summary?.transmissions ?? []).map((t) => (
          <div key={t.team} className="dc-closing-row">
            <span className={`dc-tdot t${t.team}`} />
            <b>
              {teamName(view, t.team)} {fmtCode(t.code)}
            </b>
            <span className="clues">{(t.clues ?? []).join(" / ")}</span>
            <span className={t.miscommunicated ? "bad" : "ok"}>
              {t.miscommunicated ? "misread" : "decoded"}
            </span>
            {t.interceptGuess && (
              <span className={t.intercepted ? "bad" : "ok"}>
                {t.intercepted ? "intercepted" : "held"}
              </span>
            )}
          </div>
        ))}
      </div>
    );
    right = (
      <>
        <StatusLamps
          rows={[{ label: "Round end", state: "work", text: "Next round in a moment" }]}
        />
        <div className="dc-keyplate">Key locked</div>
      </>
    );
  }

  const litOther = (team: Team) => lit[team].some(Boolean) && side !== team;

  return (
    <GameScreen
      background="bg-surface-950"
      leftSidebarTitle="Operators"
      leftSidebar={
        <div className="dc-room h-full" style={vars}>
          <Operators
            view={view}
            playerNames={playerNames}
            images={images}
            onChat={(text) => onAction({ kind: "chat", text })}
          />
        </div>
      }
      sidebar={
        <div className="dc-room" style={vars}>
          <History view={view} />
        </div>
      }
    >
      <div ref={deskRef} className="dc-room dc-desk" style={vars}>
        <div className="dc-felt">
          <span className="dc-screw tl" aria-hidden />
          <span className="dc-screw tr" aria-hidden />
          <div className="dc-instr">
            <TokenTray view={view} team={0} />
            <Nixie value={Math.max(view.round, 1)} label={`Round · of ${view.maxRounds}`} />
            <TokenTray view={view} team={1} />
          </div>
          {!interceptorOnly && (
            <div className="dc-side-toggle" role="tablist" aria-label="Code screens">
              {screenTeams.map((team) => (
                // biome-ignore lint/correctness/noRestrictedElements: brass screen selector tabs painted on the desk
                <button
                  key={team}
                  type="button"
                  role="tab"
                  aria-selected={side === team}
                  onClick={() => setSide(team)}
                >
                  <span className={`dc-tdot t${team}`} />
                  {team === view.team ? "Our screen" : `${teamName(view, team)}'s screen`}
                  {litOther(team) && <Lamp state="work" />}
                </button>
              ))}
            </div>
          )}
          <div
            className="dc-screens"
            style={interceptorOnly ? { gridTemplateColumns: "1fr" } : undefined}
          >
            {screenTeams.map(screen)}
          </div>
          <div className="dc-slot">
            <div className="dc-slot-col left">
              {left}
              {!revealing && <LastCard view={view} last={last} />}
            </div>
            <div className="dc-slot-col">{mid}</div>
            <div className="dc-slot-col right">{right}</div>
          </div>
        </div>
        <div className="dc-edge" aria-hidden />
      </div>
    </GameScreen>
  );
}
